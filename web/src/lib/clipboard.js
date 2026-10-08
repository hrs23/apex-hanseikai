export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  const input = document.createElement("textarea");
  const active = document.activeElement;
  input.value = text;
  input.readOnly = true;
  input.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.append(input);
  input.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch {}
  input.remove();
  active?.focus({ preventScroll: true });
  return copied;
}
