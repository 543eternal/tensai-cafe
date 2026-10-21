/* ============================================================
   天才カフェ script.js
   ふだんは編集不要です。
   ・イベントは data/events.json
   ・ゲストは data/guests.json
   ・参加者の声は data/voices.json
   ・各種URLは config.js
   を編集してください。（tools/index.html を使うと画面から作れます）
   ============================================================ */
(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var LINE_URL = config.lineUrl || "";
  var NEWSLETTER_URL = config.newsletterUrl || "";
  var INSTAGRAM_URL = config.instagramUrl || "";
  var YOUTUBE_URL = config.youtubeUrl || "";
  var FORM_URL = config.formUrl || "";
  var FORM_EVENT_ENTRY = config.formEventEntry || "";
  var SEATS_API_URL = config.seatsApiUrl || "";
  var SESSION_URL = config.sessionUrl || "https://543eternal.github.io/rumi-menu/";

  /* ---------- 共通リンクの反映（空のリンクは自動で隠す） ---------- */
  var linkMap = {
    line: LINE_URL,
    newsletter: NEWSLETTER_URL,
    instagram: INSTAGRAM_URL,
    youtube: YOUTUBE_URL,
    form: FORM_URL,
    session: SESSION_URL
  };
  document.querySelectorAll("[data-link]").forEach(function (node) {
    var key = node.getAttribute("data-link");
    var url = linkMap[key];
    if (url && String(url).trim() !== "") {
      node.setAttribute("href", url);
    } else {
      var parentLi = node.closest("li");
      if (parentLi) parentLi.style.display = "none";
      else node.style.display = "none";
    }
  });

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- 小さな道具 ---------- */
  function isEmpty(value) {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) {
      return value.filter(function (v) { return !isEmpty(v); }).length === 0;
    }
    return String(value).trim() === "";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function linkButton(text, href, className) {
    var a = el("a", "btn " + (className || "btn--main"), text);
    a.href = href || "#";
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  // 今日の日付を "YYYY-MM-DD" で返す
  function getTodayString() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // "2026-11-15" → "2026年11月15日（日）"
  var WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  function formatDateJP(dateStr) {
    if (isEmpty(dateStr)) return "日程調整中";
    var parts = String(dateStr).split("-");
    if (parts.length !== 3) return dateStr;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    var dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return dateStr;
    var w = WEEKDAYS[dt.getDay()];
    return y + "年" + m + "月" + d + "日（" + w + "）";
  }

  function formatTimeRange(startTime, endTime) {
    if (isEmpty(startTime) && isEmpty(endTime)) return "";
    if (!isEmpty(startTime) && !isEmpty(endTime)) return startTime + "〜" + endTime;
    return startTime || endTime;
  }

  function formatLabel(format) {
    if (format === "offline") return { text: "会場開催", cls: "badge--offline" };
    if (format === "online") return { text: "オンライン", cls: "badge--online" };
    if (format === "hybrid") return { text: "会場＋オンライン", cls: "badge--hybrid" };
    return null;
  }

  // YouTubeのURLから埋め込み用URLに変換
  function toYoutubeEmbedUrl(url) {
    if (isEmpty(url)) return "";
    var s = String(url).trim();
    var m =
      s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/);
    if (m && m[1]) return "https://www.youtube.com/embed/" + m[1];
    return "";
  }

  // Googleフォームの自動入力つきURLを作る
  function buildApplyFormUrl(ev) {
    if (!isEmpty(ev.applyUrl)) return ev.applyUrl;
    if (isEmpty(FORM_URL)) return LINE_URL || "#";
    if (isEmpty(FORM_EVENT_ENTRY)) return FORM_URL;
    var label = (ev.title || "") + (!isEmpty(ev.date) ? "（" + formatDateJP(ev.date) + "）" : "");
    var sep = FORM_URL.indexOf("?") === -1 ? "?" : "&";
    var entryKey = FORM_EVENT_ENTRY.indexOf("entry.") === 0 ? FORM_EVENT_ENTRY : "entry." + FORM_EVENT_ENTRY;
    return FORM_URL + sep + encodeURIComponent(entryKey) + "=" + encodeURIComponent(label);
  }

  // ゲスト名の先頭1文字（写真がないときのアイコン用）
  function getInitial(name) {
    if (isEmpty(name)) return "光";
    var clean = String(name).replace(/^（仮）|\(仮\)|\s+/g, "");
    return clean.charAt(0) || "光";
  }

  /* ---------- 状態データ ---------- */
  var state = {
    guests: [],
    guestMap: {},
    events: [],
    voices: [],
    seatsMap: {},
    currentFilter: "all"
  };

  var eventListEl = document.getElementById("event-list");
  var archiveListEl = document.getElementById("archive-list");
  var guestListEl = document.getElementById("guest-list");
  var voiceListEl = document.getElementById("voice-list");
  var modal = document.getElementById("detail-modal");
  var modalBody = document.getElementById("modal-body");
  var lastFocused = null;

  /* ---------- イベントが締切・満席かどうか ---------- */
  function getEventSeatInfo(ev) {
    var apiSeat = state.seatsMap[ev.id];
    var soldOut = ev.soldOut === true || (apiSeat && apiSeat.soldOut === true);
    var remaining = apiSeat && typeof apiSeat.remaining === "number" ? apiSeat.remaining : null;
    if (remaining !== null && remaining <= 0) soldOut = true;

    var today = getTodayString();
    var deadlinePassed = !isEmpty(ev.deadline) && ev.deadline < today;
    return {
      soldOut: soldOut,
      remaining: remaining,
      deadlinePassed: deadlinePassed,
      closed: soldOut || deadlinePassed
    };
  }

  /* ---------- イベントカード生成 ---------- */
  function createEventCard(ev, isArchive) {
    var li = el("li", "reveal");
    var card = el("button", "event-card");
    card.type = "button";
    card.setAttribute("aria-haspopup", "dialog");

    if (!isEmpty(ev.image)) {
      var media = el("div", "event-card__media");
      var img = el("img");
      img.src = ev.image;
      img.alt = "";
      img.loading = "lazy";
      media.appendChild(img);
      card.appendChild(media);
    }

    var body = el("div", "event-card__body");

    // バッジ行
    var badgeRow = el("div", "badges");
    if (!isArchive && ev.isNew === true) {
      badgeRow.appendChild(el("span", "badge badge--new", "NEW"));
    }
    if (ev.status === "coming") {
      badgeRow.appendChild(el("span", "badge badge--coming", "準備中"));
    }
    var fmt = formatLabel(ev.format);
    if (fmt) badgeRow.appendChild(el("span", "badge " + fmt.cls, fmt.text));

    if (isArchive) {
      badgeRow.appendChild(el("span", "badge badge--archive", "開催終了"));
      if (ev.archive && !isEmpty(ev.archive.youtubeUrl)) {
        badgeRow.appendChild(el("span", "badge badge--video", "▶ 動画あり"));
      }
      if (ev.archive && !isEmpty(ev.archive.report)) {
        badgeRow.appendChild(el("span", "badge badge--seats", "レポートあり"));
      }
    } else {
      var seatInfo = getEventSeatInfo(ev);
      if (seatInfo.soldOut) {
        badgeRow.appendChild(el("span", "badge badge--soldout", "満席"));
      } else if (seatInfo.deadlinePassed) {
        badgeRow.appendChild(el("span", "badge badge--archive", "受付終了"));
      } else if (seatInfo.remaining !== null) {
        badgeRow.appendChild(el("span", "badge badge--seats", "残り" + seatInfo.remaining + "席"));
      }
    }
    if (badgeRow.childNodes.length) body.appendChild(badgeRow);

    // 日付と時間
    var dateRow = el("div", "event-card__date");
    dateRow.appendChild(el("span", "", formatDateJP(ev.date)));
    var timeText = formatTimeRange(ev.startTime, ev.endTime);
    if (timeText) dateRow.appendChild(el("span", "event-card__time", timeText));
    body.appendChild(dateRow);

    // タイトル・キャッチ
    body.appendChild(el("div", "event-card__title", ev.title || ""));
    if (!isEmpty(ev.catch)) body.appendChild(el("div", "event-card__catch", ev.catch));

    // 場所・オンライン情報
    var metaLines = [];
    if (!isEmpty(ev.venue)) metaLines.push("📍 " + ev.venue);
    if (ev.format === "online" || ev.format === "hybrid") {
      metaLines.push("💻 " + (!isEmpty(ev.onlineTool) ? ev.onlineTool : "オンライン参加OK"));
    }
    if (metaLines.length) {
      var metaBox = el("div", "event-card__meta");
      metaLines.forEach(function (line) { metaBox.appendChild(el("div", "", line)); });
      body.appendChild(metaBox);
    }

    // 登壇ゲストチップ
    if (Array.isArray(ev.guests) && ev.guests.length) {
      var guestWrap = el("div", "event-card__guests");
      ev.guests.forEach(function (gid) {
        var g = state.guestMap[gid];
        if (!g) return;
        var chip = el("span", "guest-chip");
        var av = el("span", "guest-chip__avatar");
        if (!isEmpty(g.image)) {
          var gimg = el("img");
          gimg.src = g.image;
          gimg.alt = "";
          av.appendChild(gimg);
        } else {
          av.textContent = getInitial(g.name);
        }
        chip.appendChild(av);
        chip.appendChild(el("span", "", g.name));
        guestWrap.appendChild(chip);
      });
      if (guestWrap.childNodes.length) body.appendChild(guestWrap);
    }

    // フッター
    var footer = el("div", "event-card__footer");
    if (!isArchive && !isEmpty(ev.price)) {
      footer.appendChild(el("span", "event-card__price", ev.price));
    }
    footer.appendChild(el("span", "event-card__more", isArchive ? "アーカイブを見る" : "くわしく見る"));
    body.appendChild(footer);

    card.appendChild(body);
    card.addEventListener("click", function () { openEventModal(ev, isArchive, card); });
    li.appendChild(card);
    return li;
  }

  /* ---------- ゲストカード生成 ---------- */
  function createGuestCard(guest) {
    var li = el("li", "reveal");
    var isComing = guest.status === "coming";
    var card = el(isComing ? "div" : "button", "guest-card" + (isComing ? " guest-card--coming" : ""));
    if (!isComing) {
      card.type = "button";
      card.setAttribute("aria-haspopup", "dialog");
    }

    var avatar = el("div", "guest-card__avatar");
    if (!isEmpty(guest.image)) {
      var img = el("img");
      img.src = guest.image;
      img.alt = guest.name || "";
      img.loading = "lazy";
      avatar.appendChild(img);
    } else {
      avatar.textContent = isComing ? "…" : getInitial(guest.name);
    }
    card.appendChild(avatar);

    if (!isEmpty(guest.title)) card.appendChild(el("div", "guest-card__role", guest.title));
    card.appendChild(el("div", "guest-card__name", guest.name || ""));
    if (!isEmpty(guest.catch)) card.appendChild(el("div", "guest-card__catch", guest.catch));

    if (!isEmpty(guest.tags)) {
      var tagWrap = el("div", "guest-card__tags");
      guest.tags.forEach(function (t) {
        if (!isEmpty(t)) tagWrap.appendChild(el("span", "tag", "#" + t));
      });
      card.appendChild(tagWrap);
    }

    if (!isComing) {
      card.appendChild(el("span", "guest-card__more", "プロフィールを見る"));
      card.addEventListener("click", function () { openGuestModal(guest, card); });
    }
    li.appendChild(card);
    return li;
  }

  /* ---------- 参加者の声カード生成 ---------- */
  function createVoiceCard(v) {
    var li = el("li", "voice-card reveal");
    li.appendChild(el("p", "voice-card__text", v.text || ""));
    if (!isEmpty(v.name)) {
      li.appendChild(el("p", "voice-card__meta", "— " + v.name));
    }
    return li;
  }

  /* ---------- イベント詳細モーダル ---------- */
  function openEventModal(ev, isArchive, trigger) {
    if (trigger) lastFocused = trigger;
    modalBody.innerHTML = "";
    var frag = document.createDocumentFragment();

    // アーカイブでYouTube動画がある場合は一番上に動画プレーヤーを表示
    var embedUrl = ev.archive ? toYoutubeEmbedUrl(ev.archive.youtubeUrl) : "";
    if (embedUrl) {
      var videoWrap = el("div", "detail__video");
      var iframe = document.createElement("iframe");
      iframe.src = embedUrl;
      iframe.title = ev.title || "アーカイブ動画";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      videoWrap.appendChild(iframe);
      frag.appendChild(videoWrap);
    } else if (!isEmpty(ev.image)) {
      var imgWrap = el("div", "detail__image");
      var img = el("img");
      img.src = ev.image;
      img.alt = "";
      imgWrap.appendChild(img);
      frag.appendChild(imgWrap);
    }

    // バッジ
    var badgeRow = el("div", "badges");
    if (!isArchive && ev.isNew === true) badgeRow.appendChild(el("span", "badge badge--new", "NEW"));
    var fmt = formatLabel(ev.format);
    if (fmt) badgeRow.appendChild(el("span", "badge " + fmt.cls, fmt.text));
    var seatInfo = getEventSeatInfo(ev);
    if (isArchive) {
      badgeRow.appendChild(el("span", "badge badge--archive", "開催終了"));
    } else if (seatInfo.soldOut) {
      badgeRow.appendChild(el("span", "badge badge--soldout", "満席"));
    } else if (seatInfo.remaining !== null) {
      badgeRow.appendChild(el("span", "badge badge--seats", "残り" + seatInfo.remaining + "席"));
    }
    frag.appendChild(badgeRow);

    var title = el("h3", "detail__title", ev.title || "");
    title.id = "modal-title";
    frag.appendChild(title);

    if (!isEmpty(ev.catch)) frag.appendChild(el("p", "detail__catch", ev.catch));
    if (!isEmpty(ev.description)) frag.appendChild(el("p", "detail__desc", ev.description));

    // アーカイブ開催レポート
    if (ev.archive && !isEmpty(ev.archive.report)) {
      var repBox = el("div", "detail__message-box");
      repBox.appendChild(el("div", "detail__message-label", "開催レポート"));
      repBox.appendChild(el("div", "detail__desc", ev.archive.report));
      frag.appendChild(repBox);
    }

    // ゲスト紹介（タップでゲストモーダルへ移動）
    if (Array.isArray(ev.guests) && ev.guests.length) {
      var validGuests = ev.guests.map(function (id) { return state.guestMap[id]; }).filter(Boolean);
      if (validGuests.length) {
        frag.appendChild(el("h4", "detail__heading", "この回の天才さん（ゲスト）"));
        var gList = el("div", "detail__sublist");
        validGuests.forEach(function (g) {
          var btn = el("button", "detail__subcard");
          btn.type = "button";
          var av = el("span", "guest-chip__avatar");
          if (!isEmpty(g.image)) {
            var gimg = el("img");
            gimg.src = g.image;
            gimg.alt = "";
            av.appendChild(gimg);
          } else {
            av.textContent = getInitial(g.name);
          }
          btn.appendChild(av);
          var info = el("div");
          info.appendChild(el("div", "detail__subcard-title", g.name + (!isEmpty(g.title) ? "（" + g.title + "）" : "")));
          if (!isEmpty(g.catch)) info.appendChild(el("div", "detail__subcard-sub", g.catch));
          btn.appendChild(info);
          btn.addEventListener("click", function () { openGuestModal(g, lastFocused); });
          gList.appendChild(btn);
        });
        frag.appendChild(gList);
      }
    }

    // 詳細テーブル
    var dateTimeText = formatDateJP(ev.date);
    var tRange = formatTimeRange(ev.startTime, ev.endTime);
    if (tRange) dateTimeText += " " + tRange;

    var venueText = "";
    if (!isEmpty(ev.venue)) venueText += ev.venue;
    if (!isEmpty(ev.address)) venueText += (venueText ? "\n" : "") + ev.address;

    var capacityText = "";
    if (!isEmpty(ev.capacity)) {
      capacityText = ev.capacity + "名";
      if (seatInfo.remaining !== null && !isArchive) {
        capacityText += "（残り" + seatInfo.remaining + "席）";
      }
    }

    var rows = [
      ["日時", dateTimeText],
      ["開催方法", fmt ? fmt.text : ""],
      ["会場", venueText],
      ["オンライン", ev.onlineTool],
      ["参加費", ev.price],
      ["定員", capacityText],
      ["申込締切", !isEmpty(ev.deadline) ? formatDateJP(ev.deadline) : ""]
    ].filter(function (r) { return !isEmpty(r[1]); });

    if (rows.length) {
      var dl = el("dl", "detail__info");
      rows.forEach(function (r) {
        var rowDiv = el("div");
        rowDiv.appendChild(el("dt", "", r[0]));
        var dd = el("dd", "", r[1]);
        if (r[0] === "会場" && !isEmpty(ev.mapUrl)) {
          var mapLink = el("a", "", "Googleマップで見る →");
          mapLink.href = ev.mapUrl;
          mapLink.target = "_blank";
          mapLink.rel = "noopener";
          mapLink.style.display = "inline-block";
          mapLink.style.marginTop = "6px";
          mapLink.style.fontSize = "14px";
          dd.appendChild(document.createElement("br"));
          dd.appendChild(mapLink);
        }
        rowDiv.appendChild(dd);
        dl.appendChild(rowDiv);
      });
      frag.appendChild(dl);
    }

    // このイベントに届いた参加者の声
    var relatedVoices = state.voices.filter(function (v) {
      return v && v.status === "published" && v.eventId === ev.id;
    });
    if (relatedVoices.length) {
      frag.appendChild(el("h4", "detail__heading", "参加された方の声"));
      var vWrap = el("div", "detail__sublist");
      relatedVoices.forEach(function (v) {
        var vc = el("div", "voice-card");
        vc.appendChild(el("p", "voice-card__text", v.text));
        if (!isEmpty(v.name)) vc.appendChild(el("p", "voice-card__meta", "— " + v.name));
        vWrap.appendChild(vc);
      });
      frag.appendChild(vWrap);
    }

    // アクションボタン
    var actions = el("div", "detail__actions");
    if (isArchive) {
      if (ev.archive && !isEmpty(ev.archive.youtubeUrl) && !embedUrl) {
        actions.appendChild(linkButton("アーカイブ動画を見る", ev.archive.youtubeUrl, "btn--main"));
      }
      if (ev.archive && !isEmpty(ev.archive.reportUrl)) {
        actions.appendChild(linkButton("開催レポートを読む", ev.archive.reportUrl, "btn--outline"));
      }
      if (!isEmpty(LINE_URL)) {
        actions.appendChild(linkButton("次回のお知らせをLINEで受け取る", LINE_URL, "btn--line"));
      }
    } else if (ev.status === "coming") {
      if (!isEmpty(LINE_URL)) {
        actions.appendChild(linkButton("公式LINEで募集開始を受け取る", LINE_URL, "btn--line"));
      }
      actions.appendChild(el("p", "detail__note", "詳細が決まり次第、公式LINEでお知らせします。"));
    } else if (seatInfo.closed) {
      var closedBtn = el("span", "btn btn--disabled", seatInfo.soldOut ? "満席のため受付終了" : "お申込み受付終了");
      actions.appendChild(closedBtn);
      if (!isEmpty(LINE_URL)) {
        actions.appendChild(linkButton("キャンセル待ち・次回案内をLINEで受け取る", LINE_URL, "btn--line"));
      }
    } else {
      // 有料チケットURL（Peatix / Stripe 等）がある場合
      if (!isEmpty(ev.ticketUrl)) {
        actions.appendChild(linkButton("チケットを購入して申し込む", ev.ticketUrl, "btn--gold"));
      }
      // 申込フォームURL（個別 applyUrl または共通 Googleフォーム）
      if (!isEmpty(ev.applyUrl) || isEmpty(ev.ticketUrl)) {
        var applyHref = buildApplyFormUrl(ev);
        actions.appendChild(linkButton("このイベントに申し込む", applyHref, "btn--main"));
      }
      if (!isEmpty(LINE_URL)) {
        actions.appendChild(linkButton("公式LINEで質問・相談する", LINE_URL, "btn--outline"));
      }
    }
    frag.appendChild(actions);

    modalBody.appendChild(frag);
    showDialog();
  }

  /* ---------- ゲスト詳細モーダル ---------- */
  function openGuestModal(guest, trigger) {
    if (trigger) lastFocused = trigger;
    modalBody.innerHTML = "";
    var frag = document.createDocumentFragment();

    var avatar = el("div", "detail__avatar");
    if (!isEmpty(guest.image)) {
      var img = el("img");
      img.src = guest.image;
      img.alt = guest.name || "";
      avatar.appendChild(img);
    } else {
      avatar.textContent = getInitial(guest.name);
    }
    frag.appendChild(avatar);

    if (!isEmpty(guest.title)) frag.appendChild(el("p", "detail__role", guest.title));
    var title = el("h3", "detail__title detail__title--center", guest.name || "");
    title.id = "modal-title";
    frag.appendChild(title);

    if (!isEmpty(guest.catch)) {
      frag.appendChild(el("p", "detail__catch detail__catch--center", guest.catch));
    }

    if (!isEmpty(guest.message)) {
      var msgBox = el("div", "detail__message-box");
      msgBox.appendChild(el("div", "detail__message-label", "✨ 不安ベイビーズのあなたへ"));
      msgBox.appendChild(el("div", "detail__message-text", guest.message));
      frag.appendChild(msgBox);
    }

    if (!isEmpty(guest.profile)) {
      frag.appendChild(el("p", "detail__desc", guest.profile));
    }

    // SNS・外部リンク
    if (Array.isArray(guest.links) && guest.links.length) {
      var linkWrap = el("div", "detail__links");
      guest.links.forEach(function (lk) {
        if (!lk || isEmpty(lk.url)) return;
        var a = el("a", "detail__link-pill", (lk.label || "リンク") + " ↗");
        a.href = lk.url;
        a.target = "_blank";
        a.rel = "noopener";
        linkWrap.appendChild(a);
      });
      if (linkWrap.childNodes.length) frag.appendChild(linkWrap);
    }

    // このゲストが参加するイベント一覧
    var today = getTodayString();
    var guestEvents = state.events.filter(function (ev) {
      return ev && ev.status === "published" && Array.isArray(ev.guests) && ev.guests.indexOf(guest.id) !== -1;
    });
    if (guestEvents.length) {
      frag.appendChild(el("h4", "detail__heading", "出演する天才カフェ"));
      var evWrap = el("div", "detail__sublist");
      guestEvents.forEach(function (ev) {
        var isPast = !isEmpty(ev.date) && ev.date < today;
        var btn = el("button", "detail__subcard");
        btn.type = "button";
        var info = el("div");
        info.appendChild(el("div", "detail__subcard-title", ev.title));
        info.appendChild(el("div", "detail__subcard-sub", formatDateJP(ev.date) + (isPast ? "（開催終了・アーカイブ）" : "（受付中）")));
        btn.appendChild(info);
        btn.addEventListener("click", function () { openEventModal(ev, isPast, lastFocused); });
        evWrap.appendChild(btn);
      });
      frag.appendChild(evWrap);
    }

    modalBody.appendChild(frag);
    showDialog();
  }

  function showDialog() {
    if (typeof modal.showModal === "function") {
      if (!modal.open) modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
    modal.scrollTop = 0;
    document.body.classList.add("is-modal-open");
  }

  function closeModal() {
    // 動画再生を止めるため中身をクリア
    if (typeof modal.close === "function" && modal.open) {
      modal.close();
    } else {
      modal.removeAttribute("open");
      onClosed();
    }
  }

  function onClosed() {
    modalBody.innerHTML = "";
    document.body.classList.remove("is-modal-open");
    if (lastFocused) lastFocused.focus();
  }

  if (modal) {
    modal.addEventListener("close", onClosed);
    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest("[data-close]")) closeModal();
    });
  }

  /* ---------- 描画処理 ---------- */
  function renderEvents() {
    if (!eventListEl || !archiveListEl) return;
    var today = getTodayString();

    var visible = state.events.filter(function (ev) {
      return ev && (ev.status === "published" || ev.status === "coming");
    });

    // 開催予定（今日以降 または 日程未定）
    var upcoming = visible.filter(function (ev) {
      return isEmpty(ev.date) || ev.date >= today || ev.status === "coming";
    });
    // 日付が近い順（日程未定・coming は後ろ）
    upcoming.sort(function (a, b) {
      if (a.status === "coming" && b.status !== "coming") return 1;
      if (a.status !== "coming" && b.status === "coming") return -1;
      var da = isEmpty(a.date) ? "9999-99-99" : a.date;
      var db = isEmpty(b.date) ? "9999-99-99" : b.date;
      return da.localeCompare(db);
    });

    // フィルター適用
    var filteredUpcoming = upcoming.filter(function (ev) {
      if (state.currentFilter === "all") return true;
      if (state.currentFilter === "offline") return ev.format === "offline" || ev.format === "hybrid";
      if (state.currentFilter === "online") return ev.format === "online" || ev.format === "hybrid";
      return true;
    });

    eventListEl.innerHTML = "";
    if (filteredUpcoming.length === 0) {
      eventListEl.appendChild(
        el("li", "list-message", "ただいま該当するイベントを準備しています。新しいご案内は公式LINEでお届けします。")
      );
    } else {
      filteredUpcoming.forEach(function (ev) {
        eventListEl.appendChild(createEventCard(ev, false));
      });
    }

    // 過去開催（アーカイブ：今日より前の日付）
    var archives = state.events.filter(function (ev) {
      return ev && ev.status === "published" && !isEmpty(ev.date) && ev.date < today;
    });
    archives.sort(function (a, b) {
      return b.date.localeCompare(a.date);
    });

    archiveListEl.innerHTML = "";
    if (archives.length === 0) {
      archiveListEl.appendChild(el("li", "list-message", "終了したイベントのレポートや動画を、順次こちらに掲載していきます。"));
    } else {
      archives.forEach(function (ev) {
        archiveListEl.appendChild(createEventCard(ev, true));
      });
    }

    observeReveal();
  }

  function renderGuests() {
    if (!guestListEl) return;
    guestListEl.innerHTML = "";
    var visible = state.guests.filter(function (g) {
      return g && (g.status === "published" || g.status === "coming");
    });
    var pub = visible.filter(function (g) { return g.status === "published"; });
    var com = visible.filter(function (g) { return g.status === "coming"; });
    var list = pub.concat(com);

    if (!list.length) {
      guestListEl.appendChild(el("li", "list-message", "ゲストのご紹介を準備中です。"));
    } else {
      list.forEach(function (g) { guestListEl.appendChild(createGuestCard(g)); });
    }
    observeReveal();
  }

  function renderVoices() {
    if (!voiceListEl) return;
    voiceListEl.innerHTML = "";
    var visible = state.voices.filter(function (v) {
      return v && v.status === "published" && !isEmpty(v.text);
    });
    if (!visible.length) {
      var section = document.getElementById("voices");
      if (section) section.style.display = "none";
      return;
    }
    visible.forEach(function (v) { voiceListEl.appendChild(createVoiceCard(v)); });
    observeReveal();
  }

  /* ---------- フィルターボタン ---------- */
  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.currentFilter = btn.getAttribute("data-filter") || "all";
      document.querySelectorAll("[data-filter]").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderEvents();
    });
  });

  /* ---------- URLハッシュ・クエリから直接モーダルを開く ---------- */
  function checkDirectLink() {
    var params = new URLSearchParams(location.search);
    var hash = location.hash.replace(/^#/, "");
    var eventId = params.get("event") || (hash.indexOf("event=") === 0 ? decodeURIComponent(hash.slice(6)) : "");
    var guestId = params.get("guest") || (hash.indexOf("guest=") === 0 ? decodeURIComponent(hash.slice(6)) : "");

    if (eventId) {
      var ev = state.events.find(function (e) { return e && e.id === eventId; });
      if (ev) {
        var isPast = !isEmpty(ev.date) && ev.date < getTodayString();
        openEventModal(ev, isPast, null);
      }
    } else if (guestId && state.guestMap[guestId]) {
      openGuestModal(state.guestMap[guestId], null);
    }
  }

  /* ---------- JSONデータの読み込み（ダブルクリックで開いたとき用の控えデータつき） ---------- */
  var FALLBACK_GUESTS = [
    {
      id: "sample-guest-1",
      name: "（仮）山田 ひかり",
      title: "（仮）自然栽培農家",
      catch: "土にふれると、未来はこわくなくなる",
      profile: "（サンプルです）都会の会社員から、40歳で農家に。\n「足りない」と思っていたものは、ぜんぶ足元にあったと話します。\n季節とともに暮らす毎日の中で見つけた、ほんとうの安心について。",
      message: "大丈夫。あなたの中にも、ちゃんと育つ種があります。",
      image: "",
      tags: ["食", "暮らし", "自然"],
      links: [{ label: "Instagram", url: "https://www.instagram.com/" }],
      status: "published"
    },
    {
      id: "sample-guest-2",
      name: "（仮）佐藤 そら",
      title: "（仮）こども食堂 主宰",
      catch: "ひとりじゃないって、ごはんで伝えたい",
      profile: "（サンプルです）町の小さな食堂から、たくさんの「ただいま」を生み出しています。\nお金や制度だけでは届かない安心を、毎週のごはんで手渡しています。",
      message: "困ったら、頼っていいんだよ。それが未来をあたたかくします。",
      image: "",
      tags: ["地域", "こども", "つながり"],
      links: [],
      status: "published"
    },
    {
      id: "sample-guest-3",
      name: "（仮）近日ご紹介",
      title: "",
      catch: "次の天才さんを、ただいまお招きしています",
      profile: "",
      message: "",
      image: "",
      tags: [],
      links: [],
      status: "coming"
    }
  ];

  var FALLBACK_EVENTS = [
    {
      id: "2026-11-cafe-vol2",
      title: "（サンプル）天才カフェ vol.2　土と暮らす安心",
      catch: "農家のひかりさんと、手づくりおやつを囲んで",
      description: "（サンプルです）不安なニュースが多い今だからこそ、足元にある安心を感じる時間を。\nゲストのお話のあと、みんなでお茶とおやつをいただきながら、ゆるやかにおしゃべりします。\nひとりでのご参加も大歓迎です。",
      date: "2026-11-15",
      startTime: "13:30",
      endTime: "16:00",
      format: "offline",
      venue: "（仮）カフェ ひだまり",
      address: "（仮）東京都〇〇区〇〇 1-2-3",
      mapUrl: "",
      onlineTool: "",
      guests: ["sample-guest-1"],
      price: "3,000円（お茶・おやつ付き）",
      capacity: 20,
      deadline: "2026-11-12",
      applyUrl: "",
      ticketUrl: "",
      soldOut: false,
      image: "",
      isNew: true,
      status: "published",
      archive: { youtubeUrl: "", report: "", reportUrl: "" }
    },
    {
      id: "2026-12-online-vol3",
      title: "（サンプル）オンライン天才カフェ vol.3",
      catch: "おうちから参加できる、ごはんと安心のおはなし",
      description: "（サンプルです）こども食堂を営むそらさんをお招きして、「頼り合える未来」についてお話を伺います。\nカメラ・マイクはオフのままで大丈夫。お茶を片手に、気軽にのぞいてください。\nお申込みの方には、あとから見られる録画もお送りします。",
      date: "2026-12-06",
      startTime: "20:00",
      endTime: "21:30",
      format: "online",
      venue: "",
      address: "",
      mapUrl: "",
      onlineTool: "Zoom（お申込み後にURLをお送りします）",
      guests: ["sample-guest-2"],
      price: "1,500円",
      capacity: 50,
      deadline: "",
      applyUrl: "",
      ticketUrl: "",
      soldOut: false,
      image: "",
      isNew: true,
      status: "published",
      archive: { youtubeUrl: "", report: "", reportUrl: "" }
    },
    {
      id: "2026-09-cafe-vol1",
      title: "（サンプル）天才カフェ vol.1　はじまりの会",
      catch: "天才カフェ、はじめての開催でした",
      description: "（サンプルです）記念すべき第1回。会場とオンラインの両方から、たくさんの方にご参加いただきました。",
      date: "2026-09-20",
      startTime: "14:00",
      endTime: "16:00",
      format: "hybrid",
      venue: "（仮）カフェ ひだまり",
      address: "",
      mapUrl: "",
      onlineTool: "Zoom",
      guests: ["sample-guest-1", "sample-guest-2"],
      price: "2,000円",
      capacity: 30,
      deadline: "",
      applyUrl: "",
      ticketUrl: "",
      soldOut: false,
      image: "",
      isNew: false,
      status: "published",
      archive: {
        youtubeUrl: "",
        report: "（サンプルです）「不安を消すのではなく、不安があっても大丈夫と思える場所がほしかった」——そんな声から始まった第1回。\nおふたりのお話に、会場が何度もあたたかい笑いに包まれました。",
        reportUrl: ""
      }
    }
  ];

  var FALLBACK_VOICES = [
    {
      id: "voice-1",
      text: "（サンプル）ニュースを見るたびに胸がざわざわしていたけれど、帰り道は空がきれいに見えました。",
      name: "40代・会社員",
      eventId: "2026-09-cafe-vol1",
      status: "published"
    },
    {
      id: "voice-2",
      text: "（サンプル）「大丈夫」って、こんなにあたたかい言葉だったんだと思い出しました。",
      name: "30代・子育て中",
      eventId: "2026-09-cafe-vol1",
      status: "published"
    },
    {
      id: "voice-3",
      text: "（サンプル）オンラインで顔を出さずに参加できたので、気負わずに聞けました。",
      name: "50代・オンライン参加",
      eventId: "2026-09-cafe-vol1",
      status: "published"
    }
  ];

  function fetchJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(url + " HTTP " + res.status);
      return res.json();
    });
  }

  Promise.all([
    fetchJson("data/guests.json").catch(function (e) { console.warn(e); return FALLBACK_GUESTS; }),
    fetchJson("data/events.json").catch(function (e) { console.warn(e); return FALLBACK_EVENTS; }),
    fetchJson("data/voices.json").catch(function (e) { console.warn(e); return FALLBACK_VOICES; })
  ]).then(function (results) {
    state.guests = Array.isArray(results[0]) ? results[0] : [];
    state.events = Array.isArray(results[1]) ? results[1] : [];
    state.voices = Array.isArray(results[2]) ? results[2] : [];

    state.guestMap = {};
    state.guests.forEach(function (g) {
      if (g && g.id) state.guestMap[g.id] = g;
    });

    renderGuests();
    renderEvents();
    renderVoices();
    checkDirectLink();

    // 残席APIが設定されていれば追加で取得して反映
    if (!isEmpty(SEATS_API_URL)) {
      fetchJson(SEATS_API_URL)
        .then(function (seatsData) {
          if (seatsData && typeof seatsData === "object") {
            state.seatsMap = seatsData;
            renderEvents();
          }
        })
        .catch(function (err) { console.warn("[seatsApi]", err); });
    }
  });

  /* ---------- スクロールでふわっと表示 ---------- */
  var revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 })
    : null;

  function observeReveal() {
    document.querySelectorAll(".reveal:not(.is-visible)").forEach(function (node) {
      if (revealObserver) revealObserver.observe(node);
      else node.classList.add("is-visible");
    });
  }
  observeReveal();

  /* ---------- 固定ボタン：ヒーロー・お知らせ欄・フッターが見えたら隠す ---------- */
  var sticky = document.getElementById("sticky-cta");
  var hideTargets = [
    document.querySelector(".hero"),
    document.getElementById("join"),
    document.querySelector(".footer")
  ];
  if (sticky && "IntersectionObserver" in window) {
    var visibleSet = new Set();
    var stickyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visibleSet.add(entry.target);
        else visibleSet.delete(entry.target);
      });
      sticky.classList.toggle("is-hidden", visibleSet.size > 0);
    }, { threshold: 0.2 });
    hideTargets.forEach(function (t) { if (t) stickyObserver.observe(t); });
  }
})();
