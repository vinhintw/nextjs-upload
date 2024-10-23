import Cors from 'cors';
import { NextApiRequest, NextApiResponse } from 'next';

// Initialize the cors middleware
const cors = Cors({
  methods: ['POST', 'GET', 'HEAD'],
  origin: "*"
});

// Helper function to run middleware in Next.js
function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: Function
): Promise<void> {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function corsMiddleware(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  // Run the CORS middleware
  await runMiddleware(req, res, cors);
}
