import { API_BASE_URL } from './config';
import { assertResponseOk } from './api';

export async function fetchSocrataCategories(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/categories`);
    await assertResponseOk(response, 'Failed to load categories');
    const result = await response.json();
    return Array.isArray(result.categories) ? result.categories : [];
}
