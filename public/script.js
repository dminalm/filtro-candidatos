async function sendMessage() {
  const input = document.getElementById("userInput");
  const chat = document.getElementById("chat");

  const userText = input.value;
  if (!userText) return;

  // Mostrar en pantalla
  chat.innerHTML += `<p><strong>Tú:</strong> ${userText}</p>`;
  input.value = "";

  // Enviar al backend
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText }),
  });

  const data = await res.json();
  chat.innerHTML += `<p><strong>Marina:</strong> ${data.reply}</p>`;
  chat.scrollTop = chat.scrollHeight;
}
