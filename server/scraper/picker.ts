// Interactive XPath Picker Helper and Robust XPath Generator
import { JSDOM } from 'jsdom';

export interface PickerElementResult {
  xpath: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  parentStructure: string;
}

// Generate robust, semantic relative XPath for a DOM element
export function generateRobustXPath(element: any): string {
  if (!element || element.nodeType !== 1) return '';

  // 1. If element has unique ID, use id
  if (element.id && /^[A-Za-z0-9_\-]+$/.test(element.id)) {
    return `//*[@id="${element.id}"]`;
  }

  // 2. Check if inside a table with ID or class
  let table = element.closest ? element.closest('table') : null;
  if (table) {
    let tablePrefix = '//table';
    if (table.id) {
      tablePrefix = `//table[@id="${table.id}"]`;
    } else if (table.className && typeof table.className === 'string') {
      const firstClass = table.className.trim().split(/\s+/)[0];
      if (firstClass) tablePrefix = `//table[contains(@class, "${firstClass}")]`;
    }

    // Row index and cell index
    const tr = element.closest('tr');
    if (tr) {
      const tbody = tr.parentElement;
      const allRows = Array.from(tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr'));
      const rowIndex = allRows.indexOf(tr) + 1;

      if (element.tagName.toLowerCase() === 'td' || element.tagName.toLowerCase() === 'th') {
        const allCells = Array.from(tr.children);
        const cellIndex = allCells.indexOf(element) + 1;
        return `${tablePrefix}//tr[${rowIndex}]/td[${cellIndex}]`;
      } else {
        // Child inside td
        const td = element.closest('td') || element.closest('th');
        if (td) {
          const allCells = Array.from(tr.children);
          const cellIndex = allCells.indexOf(td) + 1;
          const tag = element.tagName.toLowerCase();
          return `${tablePrefix}//tr[${rowIndex}]/td[${cellIndex}]//${tag}`;
        }
      }
    }
  }

  // 3. Meaningful stable attribute (data-id, data-name, etc.)
  for (const attr of ['data-id', 'data-name', 'data-sku', 'data-code', 'name']) {
    const val = element.getAttribute ? element.getAttribute(attr) : null;
    if (val) {
      return `//${element.tagName.toLowerCase()}[@${attr}="${val}"]`;
    }
  }

  // 4. Relative path with parent ID
  let current = element;
  const pathParts: string[] = [];
  while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'body' && current.tagName.toLowerCase() !== 'html') {
    if (current.id) {
      pathParts.unshift(`*[@id="${current.id}"]`);
      return `//${pathParts.join('/')}`;
    }

    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = current.tagName.toLowerCase();
    pathParts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return `//${pathParts.join('/')}`;
}

// Inject interactive picker client script into HTML for live visual element selection
export function injectPickerScript(html: string): string {
  const pickerScript = `
<script>
(function() {
  var activeOverlay = document.createElement('div');
  activeOverlay.style.position = 'fixed';
  activeOverlay.style.pointerEvents = 'none';
  activeOverlay.style.border = '2px dashed #e11d48';
  activeOverlay.style.background = 'rgba(225, 29, 72, 0.1)';
  activeOverlay.style.zIndex = '999999';
  activeOverlay.style.display = 'none';
  activeOverlay.style.transition = 'all 0.05s ease';
  document.body.appendChild(activeOverlay);

  var banner = document.createElement('div');
  banner.id = '__xpath_picker_banner';
  banner.style.position = 'fixed';
  banner.style.top = '10px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.background = '#1e293b';
  banner.style.color = '#fff';
  banner.style.padding = '8px 16px';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  banner.style.zIndex = '1000000';
  banner.style.fontSize = '13px';
  banner.style.fontFamily = 'system-ui, sans-serif';
  banner.style.direction = 'rtl';
  banner.innerHTML = '🎯 حالت انتخاب XPath فعال است. روی المان مورد نظر کلیک نمایید.';
  document.body.appendChild(banner);

  function getXPath(el) {
    if (el.id) return '//*[@id="' + el.id + '"]';
    var table = el.closest ? el.closest('table') : null;
    if (table) {
      var prefix = table.id ? '//table[@id="' + table.id + '"]' : '//table';
      var tr = el.closest('tr');
      if (tr) {
        var tbody = tr.parentElement;
        var rows = Array.from(tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr'));
        var rIdx = rows.indexOf(tr) + 1;
        var td = el.closest('td') || el.closest('th');
        if (td) {
          var cells = Array.from(tr.children);
          var cIdx = cells.indexOf(td) + 1;
          if (el === td) return prefix + '//tr[' + rIdx + ']/td[' + cIdx + ']';
          return prefix + '//tr[' + rIdx + ']/td[' + cIdx + ']//' + el.tagName.toLowerCase();
        }
      }
    }
    var path = [];
    var curr = el;
    while (curr && curr.nodeType === 1 && curr.tagName.toLowerCase() !== 'body') {
      var idx = 1;
      var sib = curr.previousElementSibling;
      while (sib) {
        if (sib.tagName === curr.tagName) idx++;
        sib = sib.previousElementSibling;
      }
      path.unshift(curr.tagName.toLowerCase() + '[' + idx + ']');
      curr = curr.parentElement;
    }
    return '//' + path.join('/');
  }

  document.addEventListener('mouseover', function(e) {
    if (e.target === activeOverlay || e.target === banner || banner.contains(e.target)) return;
    var rect = e.target.getBoundingClientRect();
    activeOverlay.style.top = rect.top + 'px';
    activeOverlay.style.left = rect.left + 'px';
    activeOverlay.style.width = rect.width + 'px';
    activeOverlay.style.height = rect.height + 'px';
    activeOverlay.style.display = 'block';
  }, true);

  document.addEventListener('click', function(e) {
    if (e.target === banner || banner.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    var target = e.target;
    var xpath = getXPath(target);
    var text = target.textContent ? target.textContent.trim() : '';

    window.parent.postMessage({
      type: 'XPATH_SELECTED',
      xpath: xpath,
      text: text,
      tagName: target.tagName.toLowerCase()
    }, '*');
  }, true);
})();
</script>
`;

  return html.replace('</body>', `${pickerScript}</body>`);
}
