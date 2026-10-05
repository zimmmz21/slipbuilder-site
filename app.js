(function () {
  var transcript = document.getElementById("transcript");
  var form = document.getElementById("composer");
  var input = document.getElementById("message");
  var ratesBody = document.getElementById("rates-body");

  var latestPending = null;
  var latestGraded = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function addText(role, text) {
    var wrap = el("article", "bubble " + role);
    wrap.appendChild(el("div", "who", role === "user" ? "You" : "SlipBuilder"));
    var body = el("div", "text");
    body.appendChild(el("p", null, text));
    wrap.appendChild(body);
    transcript.appendChild(wrap);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function slipLabel(slip, kind) {
    var parts = [];
    if (kind) parts.push(kind);
    if (slip && slip.date) parts.push(slip.date);
    if (slip && slip.games && slip.games.length) parts.push(slip.games.join(", "));
    return parts.join(" · ");
  }

  function pickStatLine(pick) {
    var bits = [];
    if (pick.stat != null) bits.push(String(pick.stat));
    if (pick.line != null) bits.push(String(pick.line));
    if (pick.side != null) bits.push(String(pick.side));
    return bits.join(" · ");
  }

  function pickNote(pick) {
    var bits = [];
    if (pick.category) bits.push(String(pick.category));
    if (pick.conf != null && pick.conf !== "") {
      var c = String(pick.conf).replace(/%$/, "");
      bits.push("Confidence " + c + "%");
    }
    return bits.join(" · ");
  }

  function gradeBadge(pick) {
    var g = String(pick.grade || "").toUpperCase();
    if (g === "HIT" || g === "MISS" || g === "VOID") return g;
    if (g === "PENDING") return "Pending";
    return pick.category || "Pick";
  }

  function addSlipCards(slip, intro, kind) {
    var wrap = el("article", "bubble bot");
    wrap.appendChild(el("div", "who", "SlipBuilder"));
    var body = el("div", "text");
    if (intro) body.appendChild(el("p", null, intro));
    if (!slip || !slip.picks || !slip.picks.length) {
      body.appendChild(el("p", null, "No matching slip found in the ledger."));
      wrap.appendChild(body);
      transcript.appendChild(wrap);
      transcript.scrollTop = transcript.scrollHeight;
      return;
    }
    body.appendChild(el("p", "slip-label", slipLabel(slip, kind)));
    if (slip.header) {
      var header = String(slip.header).replace(/\s*·?\s*Slip\s*\d+/ig, "").replace(/\s{2,}/g, " ").trim();
      if (header) body.appendChild(el("p", "muted", header));
    }
    var cards = el("div", "cards");
    slip.picks.forEach(function (pick) {
      var card = el("section", "card");
      var top = el("div", "card-top");
      top.appendChild(el("div", "player", pick.player || "Unknown"));
      var badge = el("div", "badge", gradeBadge(pick));
      var g = String(pick.grade || "").toUpperCase();
      if (g === "HIT") badge.className = "badge badge-hit";
      else if (g === "MISS") badge.className = "badge badge-miss";
      else if (g === "VOID") badge.className = "badge badge-void";
      else if (g === "PENDING") badge.className = "badge badge-pending";
      top.appendChild(badge);
      card.appendChild(top);
      card.appendChild(el("p", "stat", pickStatLine(pick)));
      var note = pickNote(pick);
      if (note) card.appendChild(el("p", "note", note));
      cards.appendChild(card);
    });
    body.appendChild(cards);
    wrap.appendChild(body);
    transcript.appendChild(wrap);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function wantsResults(text) {
    return /\b(results?|grades?|graded|how\s+did|scorecard|hit\s*rate|misses?)\b/i.test(text);
  }

  function wantsSlip(text) {
    return /\b(slips?|picks?|locks?|cards?|slate|lineup|tnf|snf|mnf|sunday|thursday|monday|pending)\b/i.test(text);
  }

  function reply(text) {
    if (wantsResults(text)) {
      addSlipCards(
        latestGraded,
        "Latest graded slip from the ledger (HIT/MISS). Live board lines are not pulled in this demo.",
        "Graded slip"
      );
      return;
    }
    if (wantsSlip(text)) {
      addSlipCards(
        latestPending,
        "Live board lines are not pulled in this demo. Here is the latest real pending slip from the ledger.",
        "Pending slip"
      );
      return;
    }
    addText(
      "bot",
      "Ask for a slip to see the latest pending ledger slip, or ask for results/grades to see the latest graded slip. Live board lines are not pulled in this demo."
    );
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    addText("user", text);
    input.value = "";
    reply(text);
  });

  function showEmptyRates() {
    ratesBody.textContent = "";
    ratesBody.appendChild(el("p", null, "No graded slips yet."));
  }

  function formatRate(data) {
    var hits = Number(data.hits);
    var misses = Number(data.misses);
    var rate = data.hit_rate;
    if (rate == null && isFinite(hits) && isFinite(misses) && hits + misses > 0) {
      rate = hits / (hits + misses);
    }
    if (rate == null || rate === "" || !isFinite(Number(rate))) return null;
    var n = Number(rate);
    if (n > 1 && n <= 100) n = n / 100;
    if (n < 0 || n > 1) return null;
    return Math.round(n * 1000) / 10 + "%";
  }

  function row(label, value) {
    var line = el("div", "stat-row");
    line.appendChild(el("span", null, label));
    line.appendChild(el("span", null, String(value)));
    return line;
  }

  function renderRates(data) {
    ratesBody.textContent = "";
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      showEmptyRates();
      return;
    }
    var figure = formatRate(data);
    var hits = data.hits;
    var misses = data.misses;
    var voids = data.voids;
    var pending = data.pending;
    var graded = data.graded;
    if (
      figure == null &&
      hits == null &&
      misses == null &&
      voids == null &&
      pending == null &&
      graded == null
    ) {
      showEmptyRates();
      return;
    }
    if (figure) ratesBody.appendChild(el("p", "rate-figure", figure));
    if (hits != null) ratesBody.appendChild(row("Hits", hits));
    if (misses != null) ratesBody.appendChild(row("Misses", misses));
    if (pending != null) ratesBody.appendChild(row("Pending", pending));
    if (voids != null) ratesBody.appendChild(row("Voids", voids));
    if (graded != null) ratesBody.appendChild(row("Graded", graded));
    if (data.as_of) ratesBody.appendChild(el("p", "muted", "As of " + data.as_of));
    ratesBody.appendChild(el("p", "muted", "Hit % from graded non-VOID picks. Voids stay out of the rate."));
  }

  function loadJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("missing");
      return res.json();
    });
  }

  Promise.all([
    loadJson("data/summary.json").then(renderRates).catch(showEmptyRates),
    loadJson("data/latest-pending.json")
      .then(function (data) {
        latestPending = data;
      })
      .catch(function () {
        latestPending = null;
      }),
    loadJson("data/latest-graded.json")
      .then(function (data) {
        latestGraded = data;
      })
      .catch(function () {
        latestGraded = null;
      })
  ]).then(function () {
    addText(
      "bot",
      "SlipBuilder is local and wired to the real ledger. Ask for a slip to see the latest pending picks, or ask for results/grades for the latest graded slip. Live board lines are not pulled in this demo."
    );
  });
})();
