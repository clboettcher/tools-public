// ==UserScript==
// @name         Zeiterfassung Account Aliases
// @namespace    http://tampermonkey.net/
// @version      2
// @description  Ersetzt kryptische Kontennamen durch lesbare Aliase mit Hover-Tooltip
// @match        https://zeit.qaware.de/contract/*/*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // 1. DEINE ALIASE HIER DEFINIEREN
    // =========================================================================
    const ALIAS_MAP = {
        // Standard
        'REA-CALM-SUPPORT': 'SUPPORT',
        'PK-MTG-TIF':'MTG',

        // Business Maintenance
        'REA-TIF-BUSINESS-MAINTENANCE-ISPI-478468': 'BUSINESS-MAINTENANCE (bis 20.7.)',
        'REA-TIF-BUSINESS-MAINTENANCE-ISPI-482226': 'BUSINESS-MAINTENANCE (bis 19.10)', // C3 2026
        'REA-TIF-BUSINESS-MAINTENANCE-CSSERVICES-23': 'BUSINESS-MAINTENANCE', // C4 2026

        // Technical Maintenance
        'REA-TIF-QUALITY-ASSURANCE-ISPI-478466':'TECHNICAL-MAINTENANCE (bis 20.7.)',
        'REA-TIF-QUALITY-ASSURANCE-ISPI-482224' : 'TECHNICAL-MAINTENANCE (bis 19.10)', // C3 2026
        'REA-TIF-QUALITY-ASSURANCE-CSSERVICES-20': 'TECHNICAL-MAINTENANCE', // C4 2026

        // =========================================================================
        // Fachliche Themen
        // =========================================================================
        // BiRo
        'REA-TIF-BIRO-HYPERCARE-ISPI-476986':'BIRO-C2 (bis 20.07.)',
        'REA-TIF-HYPERCARE-APPOINTMENT-ISPI-481299': 'BIRO-C3 (ab 21.07)',

        // Lead Scoring
        'REA-TIF-LEAD-SCORING-ISPI-483832':'Completed Leads Toggle',

        // RO-Hub
        'REA-TIF-US-RO-HUB-ISPI-484010':'US-RO-Hub',

        // C4 2026
        'SP-TIF-BATTERY-REPL-CSSERVICES-31' : 'BATTERY-REPL',
        'SP-TIF-DIGITALE-TIRE-CSSERVICES-32' : 'TYRE-SPECIFIC',

    };

    // Hauptfunktion zum Ersetzen der Texte – NUR in table.timesheet-table
    function replaceAccountNames() {
        const targetTables = document.querySelectorAll('table.timesheet-table');
        if (targetTables.length === 0) return;

        targetTables.forEach(table => {
            const walker = document.createTreeWalker(
                table,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const nodesToProcess = [];
            let node;

            while ((node = walker.nextNode())) {
                const parent = node.parentElement;

                // Ausschlüsse: Inputs, bereits ersetzte Badges und Dropdown-Elemente
                if (
                    !parent ||
                    ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(parent.tagName) ||
                    parent.classList.contains('account-alias-badge') ||
                    parent.closest('div.dropdown')
                ) {
                    continue;
                }

                for (const fullCode of Object.keys(ALIAS_MAP)) {
                    if (node.nodeValue.includes(fullCode)) {
                        nodesToProcess.push(node);
                        break;
                    }
                }
            }

            // Textknoten direkt durch "🏷️ Alias" ersetzen
            for (const textNode of nodesToProcess) {
                const parent = textNode.parentElement;
                if (!parent) continue;

                let elements = [textNode.nodeValue];
                let hasMatches = false;

                for (const [fullCode, alias] of Object.entries(ALIAS_MAP)) {
                    let nextElements = [];
                    for (const item of elements) {
                        if (typeof item === 'string' && item.includes(fullCode)) {
                            const parts = item.split(fullCode);
                            parts.forEach((part, index) => {
                                if (part) nextElements.push(part);
                                if (index < parts.length - 1) {
                                    const badge = document.createElement('span');
                                    // Klasse dient nur als Marker gegen Endlosschleifen, kein CSS dahinter
                                    badge.className = 'account-alias-badge';
                                    badge.textContent = `🏷️ ${alias}`;
                                    nextElements.push(badge);
                                    hasMatches = true;
                                }
                            });
                        } else {
                            nextElements.push(item);
                        }
                    }
                    elements = nextElements;
                }

                if (hasMatches) {
                    const fragment = document.createDocumentFragment();
                    for (const el of elements) {
                        if (typeof el === 'string') {
                            fragment.appendChild(document.createTextNode(el));
                        } else {
                            fragment.appendChild(el);
                        }
                    }
                    parent.replaceChild(fragment, textNode);
                }
            }
        });
    }

    // Observer für dynamisch geladene Zeilen/Tabellen
    let timeout = null;
    const observer = new MutationObserver(() => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            observer.disconnect();
            replaceAccountNames();
            observer.observe(document.body, { childList: true, subtree: true });
        }, 150);
    });

    // Starten
    replaceAccountNames();
    observer.observe(document.body, { childList: true, subtree: true });
})();
