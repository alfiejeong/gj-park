/**
 * [셔틀 작전 V60.0] 멀티소스 통합판
 *
 * 변경점 vs V52.0:
 * 1. 루리웹 단독 → SOURCES 배열 기반 멀티소스 구조로 리팩터링.
 *    - 루리웹 (확정 동작)
 *    - 웃긴대학 (시험판 — selector 무난, 구식 HTML)
 *    - 오늘의유머 (시험판 — anti-bot 가능성. 차단되면 자동 skip하고 다음 소스로)
 * 2. 한 소스가 실패해도 try/catch로 격리 → 나머지 소스는 계속 수급.
 * 3. 본문 selector를 배열로 받아 첫 번째로 매칭되는 것을 사용 → HTML 미세 변경에 강함.
 * 4. 제목 꼬리 정리(예: "제목 | 루리웹" → "제목")를 정규식 한 줄로.
 * 5. 이미지 재호스팅(rehostImageToDrive_) 그대로 유지 — 핫링크 차단 우회.
 *
 * 추후 소스 추가 방법:
 *   SOURCES 배열에 객체 하나만 더 push 하면 됨. 형식은 아래 RULI 객체 참고.
 *   주의: Cloudflare로 보호되는 사이트(FM코리아, 인벤, 디시 일부 등)는
 *   UrlFetchApp에서 403/503이 떠서 안 됨. 한국 일반 게시판류만 가능.
 */

const DRIVE_FOLDER_ID = "10osneXcIBiNNhqH909jeLmBlYqc1cGQn";
const S_ID = "12Y6TJIMzH5FAWySMqhWce53uNIOHJoi6zWYO0To2qqA";
const B_NAME = "쌍칼(셔틀봇)", B_PW = "1547";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

// ───────────────────────────────────────────────────────────
// 소스 설정 — 새 사이트 추가 시 여기에 객체만 하나 더 넣으면 됨.
// ───────────────────────────────────────────────────────────
const SOURCES = [
  {
    key: "RULI",
    name: "루리웹",
    listUrl: "https://bbs.ruliweb.com/best/humor",
    idPattern: /board\/300143\/read\/(\d{7,11})/g,
    readUrl: function(id) { return "https://bbs.ruliweb.com/community/board/300143/read/" + id; },
    contentStartSelectors: ['class="view_content"', 'class="board_main_view"'],
    contentEndSelectors: ['class="board_bottom"'],
    referer: "https://bbs.ruliweb.com/",
    titleStripPattern: /\s*[|]\s*루리웹.*$/i,
    postCleanPatterns: []
  },
  {
    key: "WUT",
    name: "웃긴대학",
    listUrl: "http://web.humoruniv.com/board/humor/list.html?table=pds01",
    idPattern: /(?:read|view)\.html\?[^"']*?number=(\d{4,10})/g,
    readUrl: function(id) { return "http://web.humoruniv.com/board/humor/read.html?table=pds01&number=" + id; },
    contentStartSelectors: ['id="pdsContent"', 'class="view_cont"', 'class="cont_in_view"', 'class="vCont"'],
    contentEndSelectors: ['class="con_txt_footer"', 'id="commentArea"', 'class="commentList"'],
    referer: "http://web.humoruniv.com/",
    titleStripPattern: /\s*[-|]\s*(웃긴대학|HUMORUNIV).*$/i,
    postCleanPatterns: []
  },
  {
    key: "OYU",
    name: "오유",
    listUrl: "https://www.todayhumor.co.kr/board/list.php?table=bestofbest",
    idPattern: /no=(\d{5,10})/g,
    readUrl: function(id) { return "https://www.todayhumor.co.kr/board/view.php?table=bestofbest&no=" + id; },
    contentStartSelectors: ['class="viewContent"', 'id="memoContent"', 'class="view_content"'],
    // [조정] 본문 바로 뒤에 따라오는 영역(공감/비공감/댓글/출처 등)을 차단하기 위해 종료 selector 후보 확장.
    // 첫 매칭 기준으로 자르므로, 순서를 앞에서부터 가장 촘촘히 배치.
    contentEndSelectors: [
      'id="writerInfo"',
      'class="writer_info"',
      'id="dislikeCon"',          // 비공감 사유
      'class="dislikeBox"',
      'class="oppositionReasonWrapper"',
      'id="moreMenuList"',
      'id="commentList"',
      'class="commentTitle"',
      'class="commentWrapper"',
      'class="socialBox"',        // SNS 공유
      'class="viewEtcBox"',
      '<!-- 비공감'
    ],
    referer: "https://www.todayhumor.co.kr/",
    titleStripPattern: /\s*[-|]\s*(오늘의 ?유머|todayhumor).*$/i,
    // [신규 2026-04-19] 오유 전용 본문 꼬리 정리 (HTML 세척 후 적용)
    postCleanPatterns: [
      /(?:비공감|반대)\s*사유[\s\S]*$/i,       // "비공감 사유 ..." 이후 전부
      /출처\s*[:：][\s\S]*$/i,                 // "출처 : ..."
      /댓글\s*\d*[\s\S]*$/i,                   // "댓글 0 / 댓글 쓰기 ..."
      /(?:좋아요|공감|추천)\s*\d+\s*(?:싫어요|비공감)?\s*\d*[\s\S]*$/i,
      /\b조회\s*\d[\d,]*[\s\S]*$/i
    ]
  }
];

// ───────────────────────────────────────────────────────────
// 본문에서 의미 있는 첫 이미지 1장 추출
// ───────────────────────────────────────────────────────────
function extractFirstImage_(bodyHtml) {
  const iRx = /src=["']([^"']*?\.(?:jpg|jpeg|png|gif|webp|bmp)[^"']*?)["']/i;
  const m = bodyHtml.match(iRx);
  if (!m) return "";
  const raw = m[1];
  if (/logo|icon|avatar|banner|ad_|sns|emoji|btn_|spr_/i.test(raw.toLowerCase())) return "";
  let url = raw.startsWith("http") ? raw : (raw.startsWith("//") ? "https:" + raw : raw);
  return url.split('?')[0];
}

// ───────────────────────────────────────────────────────────
// 본문 텍스트 세척 (HTML 태그 제거 + 사이트별 잡글 제거)
// 두 번째 인자 postCleanPatterns: 소스별 후처리 정규식 배열 (옵션)
// ───────────────────────────────────────────────────────────
function cleanBodyText_(b, postCleanPatterns) {
  let txt = b.replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]*>?/gm, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"');

  const trash = [
    "분리수거", "글쓰기", "스크랩", "URL 복사", "신고", "차단 목록", "이전글", "다음글",
    "글꼴", "차단", "목록", "추천", "비추천", "답글", "출처 :", "글쓴이", "조회수",
    "베오베", "쪽지", "친구추가", "퍼가기", "댓글쓰기"
  ];
  trash.forEach(function(w) { txt = txt.split(w).join(""); });

  txt = txt.replace(/^[>\s]+/g, '')
           .replace(/#[^\s#]+/g, ' ')
           .replace(/[|ㅣ]+/g, ' ')
           .replace(/\s\d+\s\d+\s\d+\s/g, ' ')
           .replace(/\s\d+(?=\s|$)/g, ' ')
           .replace(/\s+/g, ' ')
           .trim();

  // [신규 2026-04-19] 소스별 후처리 — 오유의 경우 "비공감 사유 / 출처 / 댓글" 이후 전부 절단
  if (postCleanPatterns && postCleanPatterns.length) {
    postCleanPatterns.forEach(function(rx) { txt = txt.replace(rx, '').trim(); });
  }
  return txt;
}

// ───────────────────────────────────────────────────────────
// 제목 추출 (사이트 꼬리 제거)
// ───────────────────────────────────────────────────────────
function extractTitle_(html, stripPattern) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) return "제목 없음";
  let t = m[1].replace(/\s+/g, ' ').trim();
  if (stripPattern) t = t.replace(stripPattern, '').trim();
  return t || "제목 없음";
}

// ───────────────────────────────────────────────────────────
// 본문 잘라내기 — 시작 selector 후보들 순회 + 종료 selector 후보 중 가장 먼저 나오는 위치로 절단
// ───────────────────────────────────────────────────────────
function sliceBody_(dH, source) {
  for (let i = 0; i < source.contentStartSelectors.length; i++) {
    const sel = source.contentStartSelectors[i];
    if (dH.indexOf(sel) === -1) continue;
    const after = dH.split(sel)[1];
    if (!after) continue;

    // [수정] 종료 selector 후보 배열 지원 — 여러 개 중 가장 먼저 나오는(가장 앞 index) 것을 경계로 사용
    const ends = source.contentEndSelectors || (source.contentEndSelector ? [source.contentEndSelector] : []);
    let cutIdx = -1;
    for (let j = 0; j < ends.length; j++) {
      const pos = after.indexOf(ends[j]);
      if (pos !== -1 && (cutIdx === -1 || pos < cutIdx)) cutIdx = pos;
    }
    if (cutIdx !== -1) return after.substring(0, cutIdx);
    return after.substring(0, 5000);
  }
  return "";
}

// ───────────────────────────────────────────────────────────
// 메인 진입점
// ───────────────────────────────────────────────────────────
function runHumorShuttle() {
  try {
    const ss = SpreadsheetApp.openById(S_ID);
    const sh = ss.getSheetByName("board");
    if (!sh) { console.error("board 시트 없음"); return; }

    const oldIds = sh.getRange("A:A").getValues().flat().map(String);
    const oldIdSet = {};
    oldIds.forEach(function(x) { oldIdSet[x] = true; });

    const summary = [];

    for (let s = 0; s < SOURCES.length; s++) {
      const source = SOURCES[s];
      console.log("🚀 [" + source.name + "] 수급 시작 → " + source.listUrl);

      let added = 0, imgOk = 0, imgFail = 0, skipped = 0;
      try {
        const listRes = UrlFetchApp.fetch(source.listUrl, {
          muteHttpExceptions: true,
          followRedirects: true,
          headers: { "User-Agent": UA, "Referer": source.referer }
        });
        const lcode = listRes.getResponseCode();
        if (lcode >= 400) {
          console.warn("[" + source.name + "] 목록 페이지 응답 " + lcode + " → 이 소스 건너뜀");
          summary.push(source.name + ": 목록 차단(" + lcode + ")");
          continue;
        }

        const listText = listRes.getContentText();
        const ids = [];
        // /g 정규식은 lastIndex 상태가 남으므로 매번 새 인스턴스로 작성
        const rx = new RegExp(source.idPattern.source, source.idPattern.flags);
        let m;
        while ((m = rx.exec(listText)) !== null) {
          if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
        }
        console.log("[" + source.name + "] 후보 ID " + ids.length + "개 발견");

        for (let k = 0; k < ids.length; k++) {
          const id = ids[k];
          const pid = source.key + "_" + id;
          if (oldIdSet[pid]) continue;

          try {
            const url = source.readUrl(id);
            const detRes = UrlFetchApp.fetch(url, {
              muteHttpExceptions: true,
              followRedirects: true,
              headers: { "User-Agent": UA, "Referer": source.referer }
            });
            const dcode = detRes.getResponseCode();
            if (dcode >= 400) { skipped++; continue; }
            const dH = detRes.getContentText();

            const b = sliceBody_(dH, source);
            if (!b || b.length < 50) { skipped++; continue; }
            if (/<video|<iframe|youtube|youtu\.be/i.test(b)) { skipped++; continue; }

            // 이미지
            const rawImg = extractFirstImage_(b);
            let img = "";
            if (rawImg) {
              img = rehostImageToDrive_(rawImg, source.key.toLowerCase() + "_" + id);
              if (img) imgOk++; else imgFail++;
            }

            // 텍스트 + 제목
            const txt = cleanBodyText_(b, source.postCleanPatterns);
            const tit = extractTitle_(dH, source.titleStripPattern);

            // [신규 2026-04-19] 키워드 블랙리스트 — 블루아카이브 관련 글은 스킵 (너무 마니아틱)
            const blackKeywords = /블루\s*아카(이브)?|bluearchive|블아/i;
            if (blackKeywords.test(tit) || blackKeywords.test(txt)) {
              skipped++;
              console.log("⏭️ [" + source.name + "] 블루아카 글 스킵: " + tit.substring(0, 30));
              continue;
            }

            if (img || txt.length > 5) {
              const body = txt.substring(0, 800) + "\n\n━━━━━━━━━━━━━━\n📢 출처: " + source.name + "\n🔗 원문: " + url;
              sh.appendRow([pid, B_NAME, "[" + source.name + "] " + tit, body, img, "", new Date(), B_PW]);
              oldIdSet[pid] = true;
              added++;
              console.log("✅ [" + source.name + "] " + tit.substring(0, 40) + (img ? " (이미지 O)" : " (이미지 X)"));
              Utilities.sleep(900);
            }
          } catch (eDet) {
            console.warn("[" + source.name + "] 본문 실패 " + id + ": " + eDet.toString());
            skipped++;
          }
        }
        summary.push(source.name + ": +" + added + "건 (img " + imgOk + "/" + (imgOk + imgFail) + ", skip " + skipped + ")");
      } catch (eSrc) {
        console.error("❌ [" + source.name + "] 소스 전체 실패: " + eSrc.toString());
        summary.push(source.name + ": 실패(" + eSrc.toString().substring(0, 80) + ")");
      }
    }

    console.log("🎉 셔틀 종료 요약\n - " + summary.join("\n - "));
  } catch (err) {
    console.error("🚨 최상위 에러: " + err);
  }
}

// ───────────────────────────────────────────────────────────
// 외부 이미지 → Drive 사본 → Drive thumbnail URL
// ───────────────────────────────────────────────────────────
function rehostImageToDrive_(imageUrl, fileName) {
  try {
    const response = UrlFetchApp.fetch(imageUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': UA,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        // 자기 사이트 Referer 위장 (일부 CDN 통과율 향상)
        'Referer': new URL_(imageUrl).origin + '/'
      }
    });
    const code = response.getResponseCode();
    if (code >= 400) {
      console.warn("이미지 fetch 실패 (" + code + "): " + imageUrl);
      return "";
    }
    const blob = response.getBlob();
    const mime = blob.getContentType() || "image/jpeg";
    const extMap = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
    const ext = extMap[mime] || "";
    blob.setName(fileName + ext);
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
  } catch (e) {
    console.warn("rehostImageToDrive_ 예외: " + e.toString());
    return "";
  }
}

// Apps Script 환경에는 URL 전역이 없으므로 Origin만 뽑는 mini polyfill
function URL_(href) {
  const m = /^(https?:\/\/[^\/]+)/i.exec(href);
  return { origin: m ? m[1] : 'https://unknown' };
}
