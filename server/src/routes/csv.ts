import { Request, Response, Router } from 'express';

const router = Router();

interface FetchCsvRequest {
    url: string;
}

// Fetch raw CSV from URL (Socrata API or any remote CSV)
router.post('/fetch', async (req: Request, res: Response) => {
    try {
        const body = req.body as FetchCsvRequest;

        if (!body.url) {
            res.status(400).json({error: 'URL is required'});
            return;
        }

        const headers: Record<string, string> = {
            'Accept': 'text/csv',
            'X-App-Token': process.env.SOCRATA_APP_TOKEN!,
        };

        const response = await fetch(body.url, {headers});

        if (!response.ok) {
            res.status(response.status).json({
                error: `Failed to fetch CSV: ${response.statusText}`,
            });
            return;
        }

        const csvText = await response.text();
        const fileName = body.url.split('/').pop() || 'remote-data.csv';

        res.json({
            csvText,
            fileName,
        });
    } catch (error) {
        console.error('CSV fetch error:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch CSV';
        res.status(500).json({error: message});
    }
});

export { router as csvRouter };
