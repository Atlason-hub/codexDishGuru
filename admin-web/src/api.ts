import { API_BASE_URL } from "./config";

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
};

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  if (!API_BASE_URL) {
    // Stubbed response for early development.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { token: "dev-token" };
  }

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json() as Promise<LoginResponse>;
}
