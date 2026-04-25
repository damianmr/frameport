# Frameport JS Quickstart

Use the same `id` and the same `availableMessages` on both sides.

## Parent side HTML

```html
<!DOCTYPE html>
<html>
  <body>
    <iframe id="quickstart-frame" src="./child.html"></iframe>

    <script src="./frameport.js"></script>
    <script src="./parent.js"></script>
  </body>
</html>
```

## Iframe side HTML

```html
<!DOCTYPE html>
<html>
  <body>
    <div>Iframe page UI</div>

    <script src="./frameport.js"></script>
    <script src="./child.js"></script>
  </body>
</html>
```

## parent.js

```ts
const iframe = document.getElementById("quickstart-frame");

const pendingChannel = frameport.lazyChannel({
  id: "quickstart-demo",
  availableMessages: ["child-ready", "get-answer"],
});

pendingChannel.onInit(async function (channel) {
  channel.listen("child-ready", function (message) {
    console.log("Child says:", message.payload.text);
  });

  const response = await channel.request(
    "get-answer",
    { timeout: 2000 },
    { question: "Hello from parent" }
  );

  console.log("Child answered:", response.payload.text);
});

iframe.addEventListener("load", function () {
  if (!iframe.contentWindow) {
    return;
  }

  pendingChannel.init(
    frameport.defaultIFrameGateway({
      currentWindow: window,
      targetWindow: iframe.contentWindow,
    })
  );
});
```

## child.js

```ts
const channel = frameport.createChannel({
  id: "quickstart-demo",
  availableMessages: ["child-ready", "get-answer"],
  ...frameport.defaultIFrameGateway({
    currentWindow: window,
    targetWindow: window.parent,
  }),
});

channel.respond("get-answer", async function (payload) {
  return {
    text: `Child received: ${payload.question}`,
  };
});

channel.send("child-ready", {
  text: "Iframe booted and ready.",
});
```
