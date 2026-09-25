// XPath Extractor using JSDOM / DOM XPath Evaluator
import { JSDOM } from 'jsdom';
import xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';

export interface XPathResult {
  success: boolean;
  count: number;
  values: string[];
  firstValue: string;
  error?: string;
}

function extractNodeText(node: any): string {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  if (!node.childNodes || node.childNodes.length === 0) return node.textContent?.trim() || '';

  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    const childText = extractNodeText(child).trim();
    if (childText) {
      if (text && !text.endsWith(' ') && !childText.startsWith(' ')) {
        text += ' ';
      }
      text += childText;
    }
  }
  return text.trim() || node.textContent?.trim() || '';
}

export function extractXPathFromHtml(html: string, xpathQuery: string): XPathResult {
  if (!xpathQuery || !xpathQuery.trim()) {
    return {
      success: false,
      count: 0,
      values: [],
      firstValue: '',
      error: 'عبارت XPath خالی است'
    };
  }

  try {
    // We try with JSDOM first which supports full HTML5 parsing
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Use document.evaluate
    const iterator = document.evaluate(
      xpathQuery,
      document,
      null,
      dom.window.XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null
    );

    const values: string[] = [];
    let node = iterator.iterateNext();

    while (node) {
      const text = extractNodeText(node);
      values.push(text);
      node = iterator.iterateNext();
    }

    return {
      success: values.length > 0,
      count: values.length,
      values,
      firstValue: values[0] || '',
      error: values.length === 0 ? 'هیچ المانی با این XPath یافت نشد' : undefined
    };
  } catch (domErr: any) {
    // Fallback to xmldom + xpath parser
    try {
      const parser = new DOMParser({
        errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } as any
      });
      const doc = parser.parseFromString(html, 'text/html');
      const nodes = xpath.select(xpathQuery, doc as any) as any[];

      const values = (nodes || []).map((n: any) => {
        if (typeof n === 'string' || typeof n === 'number') return String(n);
        return extractNodeText(n) || n.nodeValue?.trim() || '';
      }).filter(Boolean);

      return {
        success: values.length > 0,
        count: values.length,
        values,
        firstValue: values[0] || '',
        error: values.length === 0 ? 'هیچ المانی با این XPath یافت نشد' : undefined
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        count: 0,
        values: [],
        firstValue: '',
        error: `خطا در اجرای XPath: ${domErr.message || fallbackErr.message}`
      };
    }
  }
}
