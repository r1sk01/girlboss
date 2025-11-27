load((function()
  local content = ""
  for chunk in component.invoke(component.list("internet")(), "request", "https://admin-ocremote-storage.zeusteam.dev/client.lua").read do
    content = content .. chunk
  end
  return content
end)())("203.51.116.10", 1847, "clientName", 80, 25)