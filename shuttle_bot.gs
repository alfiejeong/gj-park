/**
 * [셔틀 작전 V52.0] 이미지 재호스팅판
 *
 * V51.0 대비 변경점:
 * 1. 루리웹 이미지 URL을 그대로 시트에 저장하던 것을 중단.
 *    → 브라우저가 그 URL을 직접 요청할 때 루리웹 핫링크 차단에 걸려 403 Forbidden 발생.
 * 2. rehostImageToDrive_() 헬퍼 신설.
 *    UrlFetchApp으로 서버 측에서 이미지를 내려받아 Drive에 저장 → Drive thumbnail URL 반환.
 *    UrlFetchApp은 Google 서버에서 요청이 나가므로 브라우저 Referer가 찍히지 않음 → 핫링크 차단 우회.
 * 3. 사본 만들기 실패 시 이미지 필드를 빈값으로 저장(깨진 이미지보다 낫다).
 * 4. 안전: DriveApp 권한이 필요. 최초 실행 시 GAS가 인증 팝업을 띄우므로 "허용" 클릭.
 *
 * 기존 유지: ID 추출, 본문 세척, 해시태그·숫자 소거, 수량 제한 해제.
 */

// 메인 Code.gs와 동일한 폴더 ID를 사용해서 같은 곳에 누적 저장.
const DRIVE_FOLDER_ID = "10osneXcIBiNNhqH909jeLmBlYqc1cGQn";

function runHumorShuttle() {
  const S_ID = "12Y6TJIMzH5FAWySMqhWce53uNIOHJoi6zWYO0To2qqA";
  const B_NAME = "쌍칼(셔틀봇)", B_PW = "1547";

  try {
    const ss = SpreadsheetApp.openById(S_ID);
    const sh = ss.getSheetByName("board");
    if (!sh) return;

    console.log("🚀 [V52.0] 이미지 Drive 재호스팅 모드 가동...");

    const TARGET_URL = "https://bbs.ruliweb.com/best/humor";
    const res = UrlFetchApp.fetch(TARGET_URL, {
      "muteHttpExceptions": true,
      "headers": { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    const idRx = /board\/300143\/read\/(\d{7,11})/g;
    let m, ids = [];
    const contentText = res.getContentText();
    while ((m = idRx.exec(contentText)) !== null) if (!ids.includes(m[1])) ids.push(m[1]);

    const oldIds = sh.getRange("A:A").getValues().flat().map(String);
    let count = 0;
    let imgOk = 0, imgFail = 0;

    for (let i = 0; i < ids.length; i++) {
      let pid = "RULI_" + ids[i], url = "https://bbs.ruliweb.com/community/board/300143/read/" + ids[i];
      if (oldIds.indexOf(pid) !== -1) continue;

      try {
        let dH = UrlFetchApp.fetch(url, { "muteHttpExceptions": true }).getContentText();
        let b = "";

        if (dH.indexOf('class="view_content"') !== -1) {
          b = dH.split('class="view_content"')[1].split('class="board_bottom"')[0];
        } else if (dH.indexOf('class="board_main_view"') !== -1) {
          b = dH.split('class="board_main_view"')[1].split('class="board_bottom"')[0];
        }

        if (!b || b.length < 50) continue;
        if (/<video|<iframe|youtube|youtu\.be/i.test(b)) continue;

        // [유지] 이미지 원본 URL 추출
        let rawImg = "";
        const iRx = /src=["']([^"']*?\.(?:jpg|jpeg|png|gif|webp|bmp)[^"']*?)["']/i;
        let iM = b.match(iRx);
        if (iM) {
          let rawSrc = iM[1];
          if (!/logo|icon|avatar|banner|ad_|sns/i.test(rawSrc.toLowerCase())) {
            rawImg = rawSrc.startsWith("http") ? rawSrc : "https:" + rawSrc;
            rawImg = rawImg.split('?')[0];
          }
        }

        // [신규 V52.0] 이미지 재호스팅 — 루리웹 핫링크 차단 우회
        let img = "";
        if (rawImg) {
          img = rehostImageToDrive_(rawImg, "ruli_" + ids[i]);
          if (img) { imgOk++; } else { imgFail++; console.warn("⚠️ 재호스팅 실패, 이미지 없이 입고: " + rawImg); }
        }

        // [유지] 텍스트 세척
        let txt = b.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]*>?/gm, ' ')
                    .replace(/&nbsp;/g, ' ');

        const trash = ["분리수거", "글쓰기", "스크랩", "URL 복사", "신고", "차단 목록", "이전글", "다음글", "글꼴", "차단", "목록", "추천", "비추천", "답글", "출처 :", "글쓴이", "조회수"];
        trash.forEach(word => { txt = txt.split(word).join(""); });

        txt = txt.replace(/^[>\s]+/g, '')
                 .replace(/#[^\s#]+/g, ' ')
                 .replace(/[|ㅣ]+/g, ' ')
                 .replace(/\s\d+\s\d+\s\d+\s/g, ' ')
                 .replace(/\s\d+(?=\s|$)/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();

        let titMatch = dH.match(/<title>([\s\S]*?)<\/title>/);
        let tit = titMatch ? titMatch[1].split('|')[0].trim() : "제목 없음";

        if (img || txt.length > 5) {
          sh.appendRow([pid, B_NAME, "[루리웹] " + tit, txt.substring(0, 800) + "\n\n━━━━━━━━━━━━━━\n📢 출처: 루리웹\n🔗 원문: " + url, img, "", new Date(), B_PW]);
          console.log("✅ [입고성공] " + tit + (img ? " (이미지 O)" : " (이미지 X)"));
          count++;
          Utilities.sleep(1200);
        }
      } catch (e) { console.warn("Skip: " + ids[i] + " — " + e.toString()); }
    }
    console.log("🏁 최종: " + count + "건 입고 / 이미지 성공 " + imgOk + " · 실패 " + imgFail);
  } catch (err) { console.error("🚨 에러: " + err); }
}

/**
 * [신규] 외부 이미지를 Drive에 사본으로 저장하고 Drive thumbnail URL 반환.
 * UrlFetchApp이 Google 서버에서 요청하므로 브라우저 Referer가 찍히지 않아 핫링크 차단 우회 가능.
 * 실패 시 빈 문자열 반환.
 */
function rehostImageToDrive_(imageUrl, fileName) {
  try {
    var response = UrlFetchApp.fetch(imageUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        // 루리웹 일부 CDN은 자기 사이트 Referer를 허용하는 경우가 있음 — 위장
        'Referer': 'https://bbs.ruliweb.com/'
      }
    });
    var code = response.getResponseCode();
    if (code >= 400) {
      console.warn("이미지 fetch 실패 (code " + code + "): " + imageUrl);
      return "";
    }
    var blob = response.getBlob();
    var mime = blob.getContentType() || "image/jpeg";
    var extMap = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
    var ext = extMap[mime] || "";
    blob.setName(fileName + ext);
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
  } catch (e) {
    console.warn("rehostImageToDrive_ 예외: " + e.toString());
    return "";
  }
}
