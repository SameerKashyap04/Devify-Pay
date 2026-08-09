const getApiUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!envUrl) return "http://localhost:4000";
  if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) return envUrl;
  return `https://${envUrl}`;
};

const API_URL = getApiUrl();

export async function adminApiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
}
