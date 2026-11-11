// ==UserScript==
// @name         Google Calendar Zeitspannen-Summierer
// @description  Berechnet die Dauer von von-bis Zeitangaben im Google Calendar und fügt sie in Klammern hinzu.
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @author       https://github.com/clboettcher
// @match        https://calendar.google.com/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://github.com/clboettcher/tools-public/raw/refs/heads/main/tampermonkey/google-calendar-durations.user.js
// @updateURL    https://github.com/clboettcher/tools-public/raw/refs/heads/main/tampermonkey/google-calendar-durations.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Sucht nach "HH:MM bis HH:MM" oder "HH:MM - HH:MM".
    // Der hintere Teil (?!...) stellt sicher, dass nicht bereits berechnete Werte nochmals verarbeitet werden.
    const regex = /(\d{1,2}):(\d{2})\s*(?:bis|-)\s*(\d{1,2}):(\d{2})(?!\s*\(\d{2}:\d{2}\))/gi;

    // Für Zeitspannen, deren Teile in getrennten Elementen stehen (z.B. Popup "Termin anlegen": "15:15 – 18:15")
    const timeOnlyRegex = /^\s*(\d{1,2}):(\d{2})\s*$/;
    const separatorRegex = /^\s*(?:–|-|bis)\s*$/i;
    const MARKER_CLASS = 'gcal-duration-marker';

    function formatDuration(h1, m1, h2, m2) {
        let start = parseInt(h1, 10) * 60 + parseInt(m1, 10);
        let end = parseInt(h2, 10) * 60 + parseInt(m2, 10);

        // Falls die Endzeit am nächsten Tag liegt (z.B. 23:00 bis 01:30)
        if (end < start) {
            end += 24 * 60;
        }

        const diff = end - start;
        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;

        const formattedHours = String(hours).padStart(2, '0');
        const formattedMinutes = String(minutes).padStart(2, '0');

        return `(${formattedHours}:${formattedMinutes})`;
    }

    function calculateDuration(match, h1, m1, h2, m2) {
        return `${match} ${formatDuration(h1, m1, h2, m2)}`;
    }

    function processTextNodes(element) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (regex.test(node.nodeValue)) {
                regex.lastIndex = 0; // Reset wegen globalem 'g' Flag im Regex
                node.nodeValue = node.nodeValue.replace(regex, calculateDuration);
            }
        }
    }

    function isSeparator(element) {
        return !!element && element.childElementCount === 0 && separatorRegex.test(element.textContent);
    }

    // Marker direkt hinter das Anker-Element setzen bzw. aktualisieren
    function upsertMarker(anchor, start, end, usedMarkers) {
        let marker = anchor.nextSibling;
        if (!(marker instanceof Element && marker.classList.contains(MARKER_CLASS))) {
            marker = document.createElement('span');
            marker.className = MARKER_CLASS;
            marker.style.marginLeft = '0.5em';
            anchor.after(marker);
        }

        // Bei geänderter Start-/Endzeit aktualisieren
        const text = formatDuration(start[1], start[2], end[1], end[2]);
        if (marker.textContent !== text) {
            marker.textContent = text;
        }
        usedMarkers.add(marker);
    }

    function processSplitTimeRanges(element) {
        const usedMarkers = new Set();

        // Anzeigemodus: Start, Trenner und Ende sind getrennte Textknoten.
        // Nur nicht-leere Textknoten sammeln, eigene Marker und Auswahllisten (Uhrzeit-Dropdowns) ignorieren
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: node => node.nodeValue.trim() && !node.parentElement?.closest(`.${MARKER_CLASS}, [role="listbox"], script, style`)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP
        });
        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }

        for (let i = 0; i + 2 < nodes.length; i++) {
            const start = nodes[i].nodeValue.match(timeOnlyRegex);
            const end = nodes[i + 2].nodeValue.match(timeOnlyRegex);
            if (!start || !end || !separatorRegex.test(nodes[i + 1].nodeValue)) continue;

            // Anker ist das Element der Endzeit, das den Trenner nicht mehr enthält
            let anchor = nodes[i + 2];
            while (anchor.parentNode && !anchor.parentNode.contains(nodes[i + 1])) {
                anchor = anchor.parentNode;
            }
            upsertMarker(anchor, start, end, usedMarkers);
            i += 2;
        }

        // Bearbeitungsmodus: Start und Ende sind Eingabefelder links und rechts vom Trenner
        element.querySelectorAll('input').forEach(startInput => {
            const start = startInput.value.match(timeOnlyRegex);
            if (!start) return;

            let startBox = startInput;
            while (startBox.parentElement && !isSeparator(startBox.nextElementSibling)) {
                startBox = startBox.parentElement;
            }
            const endBox = startBox.nextElementSibling?.nextElementSibling;
            const end = endBox?.querySelector('input')?.value.match(timeOnlyRegex);
            if (!end) return;

            upsertMarker(endBox, start, end, usedMarkers);
        });

        // Verwaiste Marker entfernen (z.B. beim Wechsel zwischen Anzeige- und Bearbeitungsmodus)
        element.querySelectorAll(`.${MARKER_CLASS}`).forEach(marker => {
            if (!usedMarkers.has(marker)) marker.remove();
        });
    }

    const observerOptions = { childList: true, subtree: true, characterData: true };

    function run() {
        observer.disconnect(); // Kurz abschalten, um Endlosschleifen bei eigener Textänderung zu vermeiden
        processTextNodes(document.body);
        processSplitTimeRanges(document.body);
        observer.observe(document.body, observerOptions);
    }

    // Debounce: Verhindert, dass das Skript bei jeder winzigen CSS-Änderung feuert
    let timeout = null;
    function scheduleRun() {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(run, 150);
    }

    // MutationObserver überwacht dynamische Änderungen im Google Calendar (z.B. Wochenwechsel)
    const observer = new MutationObserver(scheduleRun);

    // Eingabefelder ändern ihren Wert (Tippen, Auswahl im Dropdown) ohne DOM-Mutation
    ['input', 'change', 'click', 'keyup'].forEach(type => document.addEventListener(type, scheduleRun, true));

    // Initialer Start
    run();
})();
