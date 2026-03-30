/**
 * Throws an error with the API's detail message if the response is not ok.
 */
export async function assertResponseOk(response: Response, fallbackMessage: string): Promise<void> {
    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || `${fallbackMessage} (${response.status})`);
    }
}
