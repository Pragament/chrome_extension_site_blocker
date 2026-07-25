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

  console.log("Running query with 'IN' operator...");
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  const queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "students" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "phoneNumber" },
          op: "IN",
          value: {
            arrayValue: {
              values: [
                { stringValue: "7013647024" },
                { stringValue: "7013647024\n" },
                { stringValue: "7013647024\r\n" }
              ]
            }
          }
        }
      }
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(queryPayload)
  });

  if (!res.ok) {
    console.error("Query failed:", res.status, await res.text());
    return;
  }

  const json = await res.json();
  console.log("Query response:");
  console.log(JSON.stringify(json, null, 2));
}

run().catch(console.error);
