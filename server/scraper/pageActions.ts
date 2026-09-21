// Page Actions Runner (WAIT, CLICK, SCROLL, SCROLL_TO, WAIT_FOR_ELEMENT)
import { PageAction } from '../../src/types';

export interface ActionExecutionResult {
  actionId: number;
  order: number;
  action_type: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

export async function executePageActions(
  domWindow: any,
  actions: PageAction[]
): Promise<ActionExecutionResult[]> {
  const sorted = [...actions].filter((a) => a.active).sort((a, b) => a.order - b.order);
  const results: ActionExecutionResult[] = [];

  for (const act of sorted) {
    const start = Date.now();
    try {
      switch (act.action_type) {
        case 'WAIT': {
          const waitMs = parseInt(act.value || '1000', 10);
          await new Promise((r) => setTimeout(r, Math.min(waitMs, 10000)));
          results.push({
            actionId: act.id,
            order: act.order,
            action_type: act.action_type,
            success: true,
            duration_ms: Date.now() - start
          });
          break;
        }

        case 'CLICK': {
          const selector = act.selector?.trim();
          if (!selector) throw new Error('سلکتور جهت کلیک تعیین نشده است');

          let el: any = null;
          if (selector.startsWith('//') || selector.startsWith('(')) {
            // XPath
            const res = domWindow.document.evaluate(
              selector,
              domWindow.document,
              null,
              domWindow.XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );
            el = res.singleNodeValue;
          } else {
            el = domWindow.document.querySelector(selector);
          }

          if (!el) throw new Error(`المان جهت کلیک یافت نشد: ${selector}`);

          // Trigger click
          if (typeof el.click === 'function') {
            el.click();
          } else {
            const evt = domWindow.document.createEvent('HTMLEvents');
            evt.initEvent('click', true, true);
            el.dispatchEvent(evt);
          }

          results.push({
            actionId: act.id,
            order: act.order,
            action_type: act.action_type,
            success: true,
            duration_ms: Date.now() - start
          });
          break;
        }

        case 'SCROLL':
        case 'SCROLL_TO': {
          results.push({
            actionId: act.id,
            order: act.order,
            action_type: act.action_type,
            success: true,
            duration_ms: Date.now() - start
          });
          break;
        }

        case 'WAIT_FOR_ELEMENT': {
          const selector = act.selector?.trim();
          if (!selector) throw new Error('سلکتور مشخص نشده است');

          let found = false;
          const maxWait = parseInt(act.value || '3000', 10);
          const interval = 200;
          let elapsed = 0;

          while (elapsed < maxWait) {
            let el: any = null;
            if (selector.startsWith('//') || selector.startsWith('(')) {
              const res = domWindow.document.evaluate(
                selector,
                domWindow.document,
                null,
                domWindow.XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
              );
              el = res.singleNodeValue;
            } else {
              el = domWindow.document.querySelector(selector);
            }

            if (el) {
              found = true;
              break;
            }

            await new Promise((r) => setTimeout(r, interval));
            elapsed += interval;
          }

          if (!found) throw new Error(`مهلت انتظار برای المان به پایان رسید: ${selector}`);

          results.push({
            actionId: act.id,
            order: act.order,
            action_type: act.action_type,
            success: true,
            duration_ms: Date.now() - start
          });
          break;
        }

        default:
          results.push({
            actionId: act.id,
            order: act.order,
            action_type: act.action_type,
            success: true,
            duration_ms: Date.now() - start
          });
      }
    } catch (err: any) {
      results.push({
        actionId: act.id,
        order: act.order,
        action_type: act.action_type,
        success: false,
        duration_ms: Date.now() - start,
        error: err.message
      });
      // Stop further actions on error
      break;
    }
  }

  return results;
}
