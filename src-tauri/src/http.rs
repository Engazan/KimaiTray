use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::{header::HeaderMap, Method, Url};
use serde::{Deserialize, Serialize};

const MAX_URL_BYTES: usize = 8 * 1024;
const MAX_HEADERS: usize = 32;
const MAX_HEADER_NAME_BYTES: usize = 128;
const MAX_HEADER_VALUE_BYTES: usize = 8 * 1024;
const MAX_REQUEST_BODY_BYTES: usize = 2 * 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES: usize = 10 * 1024 * 1024;
const MAX_RESPONSE_HEADERS: usize = 64;
const MAX_RESPONSE_HEADER_BYTES: usize = 64 * 1024;
const MAX_CONCURRENT_REQUESTS: usize = 8;
const MAX_REQUEST_ID_BYTES: usize = 128;
const MAX_CANCELLATION_TOMBSTONES: usize = 1024;
const CANCELLATION_TOMBSTONE_TTL: Duration = Duration::from_secs(60);
const REQUEST_QUEUE_TIMEOUT: Duration = Duration::from_secs(10);

struct Cancellation {
    notify: tokio::sync::Notify,
}

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static HTTP_SEMAPHORE: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
static CANCELLATIONS: OnceLock<CancellationRegistry> = OnceLock::new();

enum CancellationEntry {
    Active(Arc<Cancellation>),
    Cancelled(Instant),
}

#[derive(Default)]
struct CancellationRegistry {
    entries: Mutex<HashMap<String, CancellationEntry>>,
}

struct RequestRegistration<'a> {
    registry: &'a CancellationRegistry,
    request_id: String,
}

impl Drop for RequestRegistration<'_> {
    fn drop(&mut self) {
        self.registry.remove(&self.request_id);
    }
}

impl CancellationRegistry {
    fn prune(entries: &mut HashMap<String, CancellationEntry>) {
        let now = Instant::now();
        entries.retain(|_, entry| {
            !matches!(entry, CancellationEntry::Cancelled(created) if now.duration_since(*created) >= CANCELLATION_TOMBSTONE_TTL)
        });
    }

    fn register(
        &self,
        request_id: &str,
    ) -> Result<(Arc<Cancellation>, RequestRegistration<'_>), String> {
        validate_request_id(request_id)?;
        let cancellation = Arc::new(Cancellation {
            notify: tokio::sync::Notify::new(),
        });
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prune(&mut entries);
        match entries.remove(request_id) {
            Some(CancellationEntry::Cancelled(_)) => {
                return Err("HTTP request cancelled".into());
            }
            Some(CancellationEntry::Active(active)) => {
                entries.insert(request_id.into(), CancellationEntry::Active(active));
                return Err("HTTP request id is already active".into());
            }
            None => {}
        }
        entries.insert(
            request_id.into(),
            CancellationEntry::Active(cancellation.clone()),
        );
        Ok((
            cancellation,
            RequestRegistration {
                registry: self,
                request_id: request_id.into(),
            },
        ))
    }

    fn cancel(&self, request_id: &str) -> Result<(), String> {
        validate_request_id(request_id)?;
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prune(&mut entries);
        match entries.get(request_id) {
            Some(CancellationEntry::Active(cancellation)) => {
                cancellation.notify.notify_one();
            }
            Some(CancellationEntry::Cancelled(_)) => {}
            None => {
                if entries
                    .values()
                    .filter(|entry| matches!(entry, CancellationEntry::Cancelled(_)))
                    .count()
                    >= MAX_CANCELLATION_TOMBSTONES
                {
                    if let Some(oldest) = entries
                        .iter()
                        .filter_map(|(id, entry)| match entry {
                            CancellationEntry::Cancelled(created) => Some((id.clone(), *created)),
                            CancellationEntry::Active(_) => None,
                        })
                        .min_by_key(|(_, created)| *created)
                        .map(|(id, _)| id)
                    {
                        entries.remove(&oldest);
                    }
                }
                entries.insert(
                    request_id.into(),
                    CancellationEntry::Cancelled(Instant::now()),
                );
            }
        }
        Ok(())
    }

    fn remove(&self, request_id: &str) {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(request_id);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    request_id: String,
    url: String,
    allowed_origin: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
}

fn validate_url(value: &str) -> Result<Url, String> {
    if value.len() > MAX_URL_BYTES {
        return Err("HTTP URL is too long".into());
    }
    let url = Url::parse(value).map_err(|_| "Invalid HTTP URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS URLs are allowed".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Credentials embedded in URLs are not allowed".into());
    }
    if url.host_str().is_none() {
        return Err("HTTP URL must include a host".into());
    }
    let host = url.host_str().unwrap_or_default();
    let ip_literal = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(address) = ip_literal.parse::<IpAddr>() {
        let unsafe_address = match address {
            IpAddr::V4(ip) => ip.is_unspecified() || ip.is_link_local() || ip.is_multicast(),
            IpAddr::V6(ip) => {
                ip.is_unspecified() || ip.is_unicast_link_local() || ip.is_multicast()
            }
        };
        if unsafe_address {
            return Err("HTTP target IP range is not allowed".into());
        }
    }
    Ok(url)
}

fn validate_url_for_origin(value: &str, allowed_origin: &str) -> Result<Url, String> {
    let url = validate_url(value)?;
    let origin = validate_url(allowed_origin)?;
    if origin.path() != "/" || origin.query().is_some() || origin.fragment().is_some() {
        return Err("Allowed HTTP origin must not include a path, query, or fragment".into());
    }
    if url.origin() != origin.origin() {
        return Err("HTTP request origin is not authorized".into());
    }
    Ok(url)
}

fn validate_method(value: &str) -> Result<Method, String> {
    match value {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PATCH" => Ok(Method::PATCH),
        "DELETE" => Ok(Method::DELETE),
        _ => Err("HTTP method is not allowed".into()),
    }
}

fn validate_headers(values: Vec<(String, String)>) -> Result<HeaderMap, String> {
    if values.len() > MAX_HEADERS {
        return Err("Too many HTTP headers".into());
    }
    let mut headers = HeaderMap::new();
    for (name, value) in values {
        if name.len() > MAX_HEADER_NAME_BYTES || value.len() > MAX_HEADER_VALUE_BYTES {
            return Err("HTTP header is too long".into());
        }
        let name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "Invalid HTTP header name".to_string())?;
        if matches!(
            name.as_str(),
            "host" | "content-length" | "connection" | "proxy-authorization"
        ) {
            return Err("HTTP header is not allowed".into());
        }
        let value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|_| "Invalid HTTP header value".to_string())?;
        headers.append(name, value);
    }
    Ok(headers)
}

fn client() -> Result<&'static reqwest::Client, String> {
    if let Some(client) = HTTP_CLIENT.get() {
        return Ok(client);
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Failed to initialize HTTP client".to_string())?;
    let _ = HTTP_CLIENT.set(client);
    HTTP_CLIENT
        .get()
        .ok_or_else(|| "Failed to initialize HTTP client".to_string())
}

fn cancellations() -> &'static CancellationRegistry {
    CANCELLATIONS.get_or_init(CancellationRegistry::default)
}

fn validate_request_id(request_id: &str) -> Result<(), String> {
    if request_id.is_empty() || request_id.len() > MAX_REQUEST_ID_BYTES {
        return Err("Invalid HTTP request id".into());
    }
    Ok(())
}

async fn acquire_request_permit<'a>(
    semaphore: &'a tokio::sync::Semaphore,
    cancellation: &Cancellation,
    timeout: Duration,
) -> Result<tokio::sync::SemaphorePermit<'a>, String> {
    tokio::select! {
        result = tokio::time::timeout(timeout, semaphore.acquire()) => {
            result
                .map_err(|_| "HTTP request queue timed out".to_string())?
                .map_err(|_| "HTTP request queue is unavailable".to_string())
        },
        _ = cancellation.notify.notified() => Err("HTTP request cancelled".into()),
    }
}

#[tauri::command]
pub fn cancel_http_request(request_id: String) -> Result<(), String> {
    cancellations().cancel(&request_id)
}

#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let (cancellation, _registration) = cancellations().register(&request.request_id)?;
    let url = validate_url_for_origin(&request.url, &request.allowed_origin)?;
    let method = validate_method(&request.method)?;
    let headers = validate_headers(request.headers)?;
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_REQUEST_BODY_BYTES)
    {
        return Err("HTTP request body is too large".into());
    }

    let semaphore =
        HTTP_SEMAPHORE.get_or_init(|| tokio::sync::Semaphore::new(MAX_CONCURRENT_REQUESTS));
    let _permit = acquire_request_permit(semaphore, &cancellation, REQUEST_QUEUE_TIMEOUT).await?;

    let mut builder = client()?.request(method, url).headers(headers);
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let mut response = tokio::select! {
        result = builder.send() => result.map_err(|_| "HTTP request failed".to_string())?,
        _ = cancellation.notify.notified() => return Err("HTTP request cancelled".into()),
    };

    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BODY_BYTES as u64)
    {
        return Err("HTTP response body is too large".into());
    }

    let status = response.status();
    if response.headers().len() > MAX_RESPONSE_HEADERS {
        return Err("Too many HTTP response headers".into());
    }
    let mut header_bytes = 0usize;
    let mut headers = Vec::new();
    for (name, value) in response.headers() {
        let Ok(value) = value.to_str() else {
            continue;
        };
        header_bytes = header_bytes.saturating_add(name.as_str().len() + value.len());
        if header_bytes > MAX_RESPONSE_HEADER_BYTES {
            return Err("HTTP response headers are too large".into());
        }
        headers.push((name.to_string(), value.to_string()));
    }
    let mut body = Vec::new();
    loop {
        let chunk = tokio::select! {
            result = response.chunk() => result.map_err(|_| "Failed to read HTTP response".to_string())?,
            _ = cancellation.notify.notified() => return Err("HTTP request cancelled".into()),
        };
        let Some(chunk) = chunk else { break };
        if body.len() + chunk.len() > MAX_RESPONSE_BODY_BYTES {
            return Err("HTTP response body is too large".into());
        }
        body.extend_from_slice(&chunk);
    }

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        acquire_request_permit, validate_headers, validate_method, validate_url,
        validate_url_for_origin, Cancellation, CancellationRegistry, MAX_CANCELLATION_TOMBSTONES,
    };
    use std::time::Duration;

    #[test]
    fn accepts_supported_http_requests() {
        assert!(validate_url("https://kimai.example.test/api/version").is_ok());
        assert!(validate_url("http://localhost:8001/api/version").is_ok());
        assert!(validate_url_for_origin(
            "https://kimai.example.test/api/version",
            "https://kimai.example.test"
        )
        .is_ok());
        assert!(validate_method("GET").is_ok());
        assert!(validate_method("PATCH").is_ok());
        assert!(validate_headers(vec![("authorization".into(), "Bearer token".into())]).is_ok());
    }

    #[test]
    fn rejects_unsafe_request_metadata() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("https://user:password@example.test").is_err());
        assert!(validate_url("http://169.254.169.254/latest/meta-data").is_err());
        assert!(validate_url("http://[fe80::1]/metadata").is_err());
        assert!(validate_url_for_origin(
            "https://attacker.example.test/collect",
            "https://kimai.example.test"
        )
        .is_err());
        assert!(validate_url_for_origin(
            "https://kimai.example.test/api",
            "https://kimai.example.test/prefix"
        )
        .is_err());
        assert!(validate_method("TRACE").is_err());
        assert!(validate_headers(vec![("host".into(), "attacker.test".into())]).is_err());
        assert!(validate_headers(vec![("x-invalid\nname".into(), "value".into())]).is_err());
    }

    #[test]
    fn cancellation_before_registration_is_consumed_atomically() {
        let registry = CancellationRegistry::default();
        registry.cancel("request-a").unwrap();

        let error = match registry.register("request-a") {
            Ok(_) => panic!("pre-cancelled request unexpectedly registered"),
            Err(error) => error,
        };
        assert_eq!(error, "HTTP request cancelled");
        assert!(registry.entries.lock().unwrap().is_empty());
    }

    #[test]
    fn active_request_ids_remain_unique_and_are_released_on_drop() {
        let registry = CancellationRegistry::default();
        let (_, registration) = registry.register("request-a").unwrap();
        assert!(registry.register("request-a").is_err());

        drop(registration);
        assert!(registry.register("request-a").is_ok());
    }

    #[test]
    fn orphan_cancellation_tombstones_are_bounded() {
        let registry = CancellationRegistry::default();
        for index in 0..=MAX_CANCELLATION_TOMBSTONES {
            registry.cancel(&format!("request-{index}")).unwrap();
        }
        assert!(registry.entries.lock().unwrap().len() <= MAX_CANCELLATION_TOMBSTONES);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn queued_request_honors_cancellation_and_timeout() {
        let semaphore = tokio::sync::Semaphore::new(1);
        let _held = semaphore.acquire().await.unwrap();
        let cancelled = Cancellation {
            notify: tokio::sync::Notify::new(),
        };
        cancelled.notify.notify_one();
        assert_eq!(
            acquire_request_permit(&semaphore, &cancelled, Duration::from_secs(1))
                .await
                .unwrap_err(),
            "HTTP request cancelled"
        );

        let waiting = Cancellation {
            notify: tokio::sync::Notify::new(),
        };
        assert_eq!(
            acquire_request_permit(&semaphore, &waiting, Duration::from_millis(1))
                .await
                .unwrap_err(),
            "HTTP request queue timed out"
        );
    }
}
