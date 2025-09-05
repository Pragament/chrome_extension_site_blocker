// Load whitelist on startup
document.addEventListener("DOMContentLoaded", async () => {
  const { whitelist = [] } = await chrome.storage.local.get("whitelist");
  document.getElementById("whitelist").value = whitelist.join("\n");
});

// Save whitelist
document.getElementById("save").addEventListener("click", async () => {
  const lines = document.getElementById("whitelist").value
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  await chrome.storage.local.set({ whitelist: lines });
  alert("Whitelist saved successfully!");
});

// Export logs to CSV
document.getElementById("export").addEventListener("click", async () => {
  const { logs = [] } = await chrome.storage.local.get("logs");

  let csv = "URL,Title,Timestamp,TabID,Allowed\n";
  logs.forEach(log => {
    csv += `"${log.url}","${log.title}","${log.timestamp}",${log.tabId},${log.allowed}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "lab_policy_logs.csv";
  a.click();

  URL.revokeObjectURL(url);
});
