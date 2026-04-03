import { useCallback, useState } from 'react';
import type { ValidationResult, DatasetValidationRequest } from '../types';
import { API_BASE_URL } from '../utils/config';
import { assertResponseOk } from '../utils/api';

export function useValidation() {
    const [isValidating, setIsValidating] = useState(false);

    const validateDataset = useCallback(async (
        request: DatasetValidationRequest
    ): Promise<ValidationResult> => {
        setIsValidating(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/validation/dataset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            await assertResponseOk(response, 'Validation API error');
            return await response.json();
        } finally {
            setIsValidating(false);
        }
    }, []);

    return {
        validateDataset,
        isValidating,
    };
}