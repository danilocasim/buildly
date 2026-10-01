export interface StarterSummary {
  slug: string;
  name: string;
  description: string;
  screens: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  starterSlug: string | null;
  updatedAt: string;
}

/** The API's error body, as the composer and cards show it. */
export async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    resetAt?: string | null;
  };
  const when = body.resetAt ? ` Try again after ${new Date(body.resetAt).toLocaleString()}.` : "";
  return `${body.message ?? `Something went wrong (${response.status}).`}${when}`;
}
