const API_URL =
  '';

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token =
    localStorage.getItem(
      'token'
    );

  const headers =
    new Headers(options.headers);

  if (
    !headers.has(
      'Content-Type'
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json'
    );
  }

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`
    );
  }

  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

  if (response.status === 401) {
    localStorage.removeItem(
      'token'
    );

    localStorage.removeItem(
      'usuarioLogado'
    );
  }

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.erro ||
        'Erro na requisição'
    );
  }

  return data;
}