async function run() {
  const apiKey = "AIzaSyBly96Mp2E2vhyHwQpmZ5PrM8l-iyLa23A";
  const projectId = "extention-7f812";

  console.log("Authenticating anonymously...");
  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });

  if (!authRes.ok) {
    console.error("Auth failed:", authRes.status, await authRes.text());
    return;
  }
  const authJson = await authRes.json();
  const refreshToken = authJson.refreshToken;

  console.log("Exchanging refresh token...");
  const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });

  if (!tokenRes.ok) {
    console.error("Token exchange failed:", tokenRes.status, await tokenRes.text());
    return;
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;

  console.log("Fetching documents from 'classes' collection...");
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/classes?pageSize=20`;
  const res = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    console.error("Fetch classes failed:", res.status, await res.text());
    return;
  }

  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

run().catch(console.error);
