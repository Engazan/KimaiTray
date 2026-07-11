use std::time::Duration;

use reqwest::{header::HeaderMap, Method, Url};
use serde::{Deserialize, Serialize};

const MAX_URL_BYTES: usize = 8 * 1024;
const MAX_HEADERS: usize = 32;
const MAX_HEADER_NAME_BYTES: usize = 128;
const MAX_HEADER_VALUE_BYTES: usize = 8 * 1024;
const MAX_REQUEST_BODY_BYTES: usize = 2 * 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES: usize = 10 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
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

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Failed to initialize HTTP client".to_string())
}

#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
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
    let mut response = builder
        .send()
        .await
        .map_err(|_| "HTTP request failed".to_string())?;

    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BODY_BYTES as u64)
    {
        return Err("HTTP response body is too large".into());
    }

    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect();
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Failed to read HTTP response".to_string())?
    {
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
