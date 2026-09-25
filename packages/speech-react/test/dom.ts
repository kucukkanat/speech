// happy-dom is a DOM implementation (like jsdom), not a mock. Registered for this file's tests only: Bun runs every
// test file in one process, and other packages' tests check behaviour *outside* a browser.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

export const withDom = () => {
  GlobalRegistrator.register();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return () => GlobalRegistrator.unregister();
};
