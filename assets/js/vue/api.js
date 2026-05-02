export async function parseResponse(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
    } catch (_) {
        return {
            success: false,
            message: text.replace(/<[^>]*>/g, '').trim().slice(0, 120) || `HTTP ${response.status}`
        };
    }
}

export function countdown(buttonState, label) {
    buttonState.seconds = 60;
    const timer = setInterval(() => {
        buttonState.seconds -= 1;
        if (buttonState.seconds <= 0) {
            clearInterval(timer);
            buttonState.loading = false;
            buttonState.seconds = 0;
            buttonState.label = label;
        } else {
            buttonState.label = `${buttonState.seconds}s`;
        }
    }, 1000);
}

export function getAuthToken() {
    return localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
}

export function authHeaders(extra = {}) {
    const token = getAuthToken();
    return token ? { ...extra, Authorization: 'Bearer ' + token } : extra;
}
