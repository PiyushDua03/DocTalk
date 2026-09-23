/**
 * DocTalk — Visualization Engine
 *
 * Renders structured data as SVG charts, HTML tables,
 * timelines, and process diagrams.
 *
 * Public API:
 *   renderVisualization(data, container)
 *   tryParseVisualization(text) → data | null
 */

/* =========================================================
   ENTRY POINT
   ========================================================= */

function renderVisualization(data, container) {
    if (!data || !container) return false;

    const type = (data.type || "").toLowerCase();

    const renderers = {
        bar: renderBarChart,
        line: renderLineChart,
        pie: renderPieChart,
        table: renderTable,
        timeline: renderTimeline,
        process: renderProcessDiagram,
    };

    const renderer = renderers[type];
    if (!renderer) return false;

    const wrapper = document.createElement("div");
    wrapper.className = "viz-container viz-" + type;

    renderer(data, wrapper);

    // Add download button for SVG-based visuals
    const svgEl2 = wrapper.querySelector("svg");
    if (svgEl2) {
        const dlBar = document.createElement("div");
        dlBar.className = "viz-download-bar";

        const dlSvg = document.createElement("button");
        dlSvg.className = "viz-download-btn";
        dlSvg.textContent = "\u2B07 Download SVG";
        dlSvg.addEventListener("click", function() { downloadSvg(svgEl2, data.title || "chart"); });
        dlBar.appendChild(dlSvg);

        wrapper.appendChild(dlBar);
    }

    container.appendChild(wrapper);
    return true;
}


/**
 * Try to extract a JSON visualization block from AI text.
 * Returns the parsed object or null.
 */
function tryParseVisualization(text) {
    if (!text) return null;

    // Look for ```json ... ``` blocks
    var jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
        try {
            var obj = JSON.parse(jsonMatch[1].trim());
            if (obj && obj.type) return obj;
        } catch (_) { /* not valid JSON */ }
    }

    // Look for raw JSON object in text
    var braceMatch = text.match(/\{[\s\S]*"type"\s*:\s*"(bar|line|pie|table|timeline|process)"[\s\S]*\}/);
    if (braceMatch) {
        try {
            var obj2 = JSON.parse(braceMatch[0]);
            if (obj2 && obj2.type) return obj2;
        } catch (_) { /* not valid JSON */ }
    }

    return null;
}


/* =========================================================
   SVG HELPERS
   ========================================================= */

var SVG_NS = "http://www.w3.org/2000/svg";

function createSvgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
        for (var k of Object.keys(attrs)) {
            el.setAttribute(k, attrs[k]);
        }
    }
    return el;
}

function createSvgText(x, y, text, attrs) {
    var el = createSvgEl("text", Object.assign({ x: x, y: y }, attrs || {}));
    el.textContent = text;
    return el;
}

var CHART_COLORS = [
    "#6366f1", "#8b5cf6", "#a78bfa", "#c084fc",
    "#e879f9", "#f472b6", "#fb7185", "#f87171",
    "#fb923c", "#fbbf24", "#a3e635", "#34d399",
];

function getChartColor(i) {
    return CHART_COLORS[i % CHART_COLORS.length];
}


/* =========================================================
   BAR CHART
   ========================================================= */

function renderBarChart(data, container) {
    var labels = data.labels || [];
    var values = data.values || [];
    var title = data.title || "Bar Chart";
    var n = Math.min(labels.length, values.length);
    if (n === 0) return;

    var W = 500, H = 320;
    var padTop = 50, padRight = 20, padBottom = 60, padLeft = 60;
    var chartW = W - padLeft - padRight;
    var chartH = H - padTop - padBottom;
    var maxVal = Math.max.apply(null, values.concat([1]));
    var barW = Math.max(20, Math.min(60, chartW / n - 10));

    var svg = createSvgEl("svg", { viewBox: "0 0 " + W + " " + H, "class": "viz-svg" });

    // Title
    svg.appendChild(createSvgText(W / 2, 28, title, {
        "text-anchor": "middle", "font-size": "15", "font-weight": "600", fill: "#e2e8f0"
    }));

    // Bars
    for (var i = 0; i < n; i++) {
        var barH = (values[i] / maxVal) * chartH;
        var x = padLeft + (chartW / n) * i + (chartW / n - barW) / 2;
        var y = padTop + chartH - barH;

        svg.appendChild(createSvgEl("rect", {
            x: x, y: y, width: barW, height: barH, rx: 4,
            fill: getChartColor(i), opacity: "0.9"
        }));

        // Value label
        svg.appendChild(createSvgText(x + barW / 2, y - 6, String(values[i]), {
            "text-anchor": "middle", "font-size": "11", fill: "#94a3b8"
        }));

        // X label
        svg.appendChild(createSvgText(x + barW / 2, padTop + chartH + 18, String(labels[i]), {
            "text-anchor": "middle", "font-size": "10", fill: "#94a3b8"
        }));
    }

    // Y axis
    svg.appendChild(createSvgEl("line", {
        x1: padLeft, y1: padTop, x2: padLeft, y2: padTop + chartH,
        stroke: "#334155", "stroke-width": "1"
    }));

    // X axis
    svg.appendChild(createSvgEl("line", {
        x1: padLeft, y1: padTop + chartH, x2: padLeft + chartW, y2: padTop + chartH,
        stroke: "#334155", "stroke-width": "1"
    }));

    container.appendChild(svg);
}


/* =========================================================
   LINE CHART
   ========================================================= */

function renderLineChart(data, container) {
    var labels = data.labels || [];
    var values = data.values || [];
    var title = data.title || "Line Chart";
    var n = Math.min(labels.length, values.length);
    if (n === 0) return;

    var W = 500, H = 320;
    var padTop = 50, padRight = 20, padBottom = 60, padLeft = 60;
    var chartW = W - padLeft - padRight;
    var chartH = H - padTop - padBottom;
    var maxVal = Math.max.apply(null, values.concat([1]));

    var svg = createSvgEl("svg", { viewBox: "0 0 " + W + " " + H, "class": "viz-svg" });

    // Title
    svg.appendChild(createSvgText(W / 2, 28, title, {
        "text-anchor": "middle", "font-size": "15", "font-weight": "600", fill: "#e2e8f0"
    }));

    // Grid
    for (var g = 0; g <= 4; g++) {
        var gy = padTop + (chartH / 4) * g;
        svg.appendChild(createSvgEl("line", {
            x1: padLeft, y1: gy, x2: padLeft + chartW, y2: gy,
            stroke: "#1e293b", "stroke-width": "1"
        }));
    }

    // Points
    var points = [];
    for (var i = 0; i < n; i++) {
        var px = padLeft + (chartW / (n - 1 || 1)) * i;
        var py = padTop + chartH - (values[i] / maxVal) * chartH;
        points.push({ x: px, y: py });
    }

    // Path
    var pathD = points.map(function(p, idx) { return (idx === 0 ? "M" : "L") + p.x + "," + p.y; }).join(" ");
    svg.appendChild(createSvgEl("path", {
        d: pathD, fill: "none", stroke: "#6366f1", "stroke-width": "2.5", "stroke-linejoin": "round"
    }));

    // Area
    var areaD = pathD + " L" + points[n - 1].x + "," + (padTop + chartH) + " L" + points[0].x + "," + (padTop + chartH) + " Z";
    
    var defs = createSvgEl("defs", {});
    var grad = createSvgEl("linearGradient", { id: "lineGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(createSvgEl("stop", { offset: "0%", "stop-color": "#6366f1" }));
    grad.appendChild(createSvgEl("stop", { offset: "100%", "stop-color": "#6366f100" }));
    defs.appendChild(grad);
    svg.insertBefore(defs, svg.firstChild);

    svg.appendChild(createSvgEl("path", {
        d: areaD, fill: "url(#lineGrad)", opacity: "0.3"
    }));

    // Dots + labels
    for (var j = 0; j < n; j++) {
        svg.appendChild(createSvgEl("circle", {
            cx: points[j].x, cy: points[j].y, r: 4, fill: "#6366f1", stroke: "#0f172a", "stroke-width": "2"
        }));
        svg.appendChild(createSvgText(points[j].x, points[j].y - 10, String(values[j]), {
            "text-anchor": "middle", "font-size": "10", fill: "#94a3b8"
        }));
        svg.appendChild(createSvgText(points[j].x, padTop + chartH + 18, String(labels[j]), {
            "text-anchor": "middle", "font-size": "10", fill: "#94a3b8"
        }));
    }

    // Axes
    svg.appendChild(createSvgEl("line", {
        x1: padLeft, y1: padTop, x2: padLeft, y2: padTop + chartH,
        stroke: "#334155", "stroke-width": "1"
    }));
    svg.appendChild(createSvgEl("line", {
        x1: padLeft, y1: padTop + chartH, x2: padLeft + chartW, y2: padTop + chartH,
        stroke: "#334155", "stroke-width": "1"
    }));

    container.appendChild(svg);
}


/* =========================================================
   PIE CHART
   ========================================================= */

function renderPieChart(data, container) {
    var labels = data.labels || [];
    var values = data.values || [];
    var title = data.title || "Pie Chart";
    var n = Math.min(labels.length, values.length);
    if (n === 0) return;

    var W = 400, H = 380;
    var cx = W / 2, cy = 180, r = 110;
    var total = values.reduce(function(a, b) { return a + b; }, 0) || 1;

    var svg = createSvgEl("svg", { viewBox: "0 0 " + W + " " + H, "class": "viz-svg" });

    svg.appendChild(createSvgText(W / 2, 28, title, {
        "text-anchor": "middle", "font-size": "15", "font-weight": "600", fill: "#e2e8f0"
    }));

    var angle = -Math.PI / 2;
    for (var i = 0; i < n; i++) {
        var slice = (values[i] / total) * 2 * Math.PI;
        var x1 = cx + r * Math.cos(angle);
        var y1 = cy + r * Math.sin(angle);
        var x2 = cx + r * Math.cos(angle + slice);
        var y2 = cy + r * Math.sin(angle + slice);
        var large = slice > Math.PI ? 1 : 0;

        svg.appendChild(createSvgEl("path", {
            d: "M" + cx + "," + cy + " L" + x1 + "," + y1 + " A" + r + "," + r + " 0 " + large + " 1 " + x2 + "," + y2 + " Z",
            fill: getChartColor(i), opacity: "0.85", stroke: "#0f172a", "stroke-width": "2"
        }));

        angle += slice;
    }

    // Legend
    var legendY = cy + r + 30;
    var cols = Math.min(n, 3);
    var colW = W / cols;
    for (var j = 0; j < n; j++) {
        var col = j % cols;
        var row = Math.floor(j / cols);
        var lx = col * colW + 20;
        var ly = legendY + row * 20;

        svg.appendChild(createSvgEl("rect", {
            x: lx, y: ly - 8, width: 10, height: 10, rx: 2, fill: getChartColor(j)
        }));
        var pct = ((values[j] / total) * 100).toFixed(1);
        svg.appendChild(createSvgText(lx + 16, ly + 1, labels[j] + " (" + pct + "%)", {
            "font-size": "10", fill: "#94a3b8"
        }));
    }

    container.appendChild(svg);
}


/* =========================================================
   TABLE
   ========================================================= */

function renderTable(data, container) {
    var headers = data.headers || [];
    var rows = data.rows || [];
    var title = data.title || "";

    if (title) {
        var h = document.createElement("h4");
        h.className = "viz-table-title";
        h.textContent = title;
        container.appendChild(h);
    }

    var wrapper = document.createElement("div");
    wrapper.className = "viz-table-scroll";

    var table = document.createElement("table");
    table.className = "viz-table";

    if (headers.length) {
        var thead = document.createElement("thead");
        var htr = document.createElement("tr");
        for (var hi = 0; hi < headers.length; hi++) {
            var th = document.createElement("th");
            th.textContent = String(headers[hi]);
            htr.appendChild(th);
        }
        thead.appendChild(htr);
        table.appendChild(thead);
    }

    var tbody = document.createElement("tbody");
    for (var ri = 0; ri < rows.length; ri++) {
        var tr = document.createElement("tr");
        var cells = Array.isArray(rows[ri]) ? rows[ri] : Object.values(rows[ri]);
        for (var ci = 0; ci < cells.length; ci++) {
            var td = document.createElement("td");
            td.textContent = String(cells[ci]);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    container.appendChild(wrapper);
}


/* =========================================================
   TIMELINE
   ========================================================= */

function renderTimeline(data, container) {
    var events = data.events || [];
    var title = data.title || "Timeline";

    if (!events.length) return;

    var h = document.createElement("h4");
    h.className = "viz-timeline-title";
    h.textContent = title;
    container.appendChild(h);

    var tl = document.createElement("div");
    tl.className = "viz-timeline";

    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        var item = document.createElement("div");
        item.className = "viz-timeline-item";

        var dot = document.createElement("div");
        dot.className = "viz-timeline-dot";

        var body = document.createElement("div");
        body.className = "viz-timeline-body";

        var date = document.createElement("span");
        date.className = "viz-timeline-date";
        date.textContent = String(ev.date || ev.year || "");

        var desc = document.createElement("span");
        desc.className = "viz-timeline-desc";
        desc.textContent = String(ev.description || ev.event || ev.text || "");

        body.appendChild(date);
        body.appendChild(desc);
        item.appendChild(dot);
        item.appendChild(body);
        tl.appendChild(item);
    }

    container.appendChild(tl);
}


/* =========================================================
   PROCESS DIAGRAM
   ========================================================= */

function renderProcessDiagram(data, container) {
    var steps = data.steps || [];
    var title = data.title || "Process";

    if (!steps.length) return;

    var h = document.createElement("h4");
    h.className = "viz-process-title";
    h.textContent = title;
    container.appendChild(h);

    var flow = document.createElement("div");
    flow.className = "viz-process-flow";

    for (var i = 0; i < steps.length; i++) {
        var step = document.createElement("div");
        step.className = "viz-process-step";

        var num = document.createElement("span");
        num.className = "viz-process-num";
        num.textContent = String(i + 1);

        var label = document.createElement("span");
        label.className = "viz-process-label";
        label.textContent = String(steps[i]);

        step.appendChild(num);
        step.appendChild(label);
        flow.appendChild(step);

        if (i < steps.length - 1) {
            var arrow = document.createElement("div");
            arrow.className = "viz-process-arrow";
            arrow.textContent = "\u2193";
            flow.appendChild(arrow);
        }
    }

    container.appendChild(flow);
}


/* =========================================================
   SVG DOWNLOAD
   ========================================================= */

function downloadSvg(svgElement, name) {
    var serializer = new XMLSerializer();
    var source = serializer.serializeToString(svgElement);
    var blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = (name || "chart") + ".svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
