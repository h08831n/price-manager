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
      const text = node.textContent?.trim() || '';
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
        return n.textContent?.trim() || n.nodeValue?.trim() || '';
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
