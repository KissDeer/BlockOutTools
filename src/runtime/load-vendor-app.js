function getRootElement(rootId) {
  const root = document.getElementById(rootId);

  if (!root) {
    throw new Error(`Missing application root: #${rootId}`);
  }

  return root;
}

function waitForApplicationMount(root, timeoutMs) {
  return new Promise((resolve, reject) => {
    const hasMounted = () => root.querySelector("canvas, button, input, [role='button']");

    if (hasMounted()) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!hasMounted()) {
        return;
      }

      window.clearTimeout(timeoutId);
      observer.disconnect();
      resolve();
    });

    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Application did not mount within ${timeoutMs} ms.`));
    }, timeoutMs);

    observer.observe(root, { childList: true, subtree: true });
  });
}

function appendClassicScript(scriptUrl) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = false;
    script.dataset.layoutToolsVendor = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error(`Unable to load vendor application: ${scriptUrl}`)),
      { once: true },
    );
    document.body.append(script);
  });
}

export async function loadVendorApp(config) {
  const root = getRootElement(config.rootId);
  const mounted = waitForApplicationMount(root, config.startupTimeoutMs);

  root.replaceChildren();
  await appendClassicScript(config.vendorScriptUrl);
  await mounted;

  document.documentElement.dataset.appReady = "true";
}

