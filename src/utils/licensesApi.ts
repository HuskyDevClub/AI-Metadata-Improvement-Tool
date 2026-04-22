import type { SocrataLicense } from '../types';
import { API_BASE_URL } from './config';
import { assertResponseOk } from './api';

export async function fetchSocrataLicenses(): Promise<SocrataLicense[]> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/licenses`);
    await assertResponseOk(response, 'Failed to load licenses');
    const result = await response.json();
    const licenses = Array.isArray(result.licenses) ? result.licenses : [];
    return licenses.filter((l: SocrataLicense) => l && typeof l.id === 'string' && typeof l.name === 'string');
}
