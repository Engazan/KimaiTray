use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

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

struct Cancellation {
    notify: tokio::sync::Notify,
}

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static HTTP_SEMAPHORE: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
static CANCELLATIONS: OnceLock<Mutex<HashMap<String, Arc<Cancellation>>>> = OnceLock::new();

struct RequestRegistration(String);

impl Drop for RequestRegistration {
    fn drop(&mut self) {
        cancellations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.0);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    request_id: String,
    url: String,
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

fn cancellations() -> &'static Mutex<HashMap<String, Arc<Cancellation>>> {
    CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_request(request_id: &str) -> Result<(Arc<Cancellation>, RequestRegistration), String> {
    if request_id.is_empty() || request_id.len() > MAX_REQUEST_ID_BYTES {
        return Err("Invalid HTTP request id".into());
    }
    let cancellation = Arc::new(Cancellation {
        notify: tokio::sync::Notify::new(),
    });
    let mut active = cancellations()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match active.entry(request_id.to_string()) {
        std::collections::hash_map::Entry::Vacant(entry) => {
            entry.insert(cancellation.clone());
        }
        std::collections::hash_map::Entry::Occupied(_) => {
            return Err("HTTP request id is already active".into());
        }
    }
    Ok((cancellation, RequestRegistration(request_id.to_string())))
}

#[tauri::command]
pub fn cancel_http_request(request_id: String) -> Result<(), String> {
    if request_id.is_empty() || request_id.len() > MAX_REQUEST_ID_BYTES {
        return Err("Invalid HTTP request id".into());
    }
    if let Some(cancellation) = cancellations()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&request_id)
    {
        cancellation.notify.notify_one();
    }
    Ok(())
}

#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let _permit = HTTP_SEMAPHORE
        .get_or_init(|| tokio::sync::Semaphore::new(MAX_CONCURRENT_REQUESTS))
        .try_acquire()
        .map_err(|_| "Too many concurrent HTTP requests".to_string())?;
    let (cancellation, _registration) = register_request(&request.request_id)?;
    let url = validate_url(&request.url)?;
    let method = validate_method(&request.method)?;
    let headers = validate_headers(request.headers)?;
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_REQUEST_BODY_BYTES)
    {
        return Err("HTTP request body is too large".into());
    }

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
    use super::{validate_headers, validate_method, validate_url};

    #[test]
    fn accepts_supported_http_requests() {
        assert!(validate_url("https://kimai.example.test/api/version").is_ok());
        assert!(validate_url("http://localhost:8001/api/version").is_ok());
        assert!(validate_method("GET").is_ok());
        assert!(validate_method("PATCH").is_ok());
        assert!(validate_headers(vec![("authorization".into(), "Bearer token".into())]).is_ok());
    }

    #[test]
    fn rejects_unsafe_request_metadata() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("https://user:password@example.test").is_err());
        assert!(validate_method("TRACE").is_err());
        assert!(validate_headers(vec![("host".into(), "attacker.test".into())]).is_err());
        assert!(validate_headers(vec![("x-invalid\nname".into(), "value".into())]).is_err());
    }
}
