/**
 * [거지주차.com] 백엔드 통합 엔진 (V.2026.04 댓글무결성판)
 *
 * 수정 사항:
 * 1. 서울시 API URL: HTTPS → HTTP 환원 (2026-04-20).
 *    사유: openapi.seoul.go.kr:8088의 TLS 구버전으로 ERR_SSL_PROTOCOL_ERROR 발생.
 *    GAS는 서버사이드 호출이라 mixed-content 이슈와 무관하므로 HTTP 사용 안전.
 * 2. 서울시 API 응답 구조 안전 체크 추가 (GetParkInfo 없을 때 빈 배열 반환)
 * 3. add_comment: 아이디당 한 주차장에 후기 1개로 제한 (기존 있으면 갱신)
 * 4. delete_comment: 본인 후기 삭제 API 신설
 * 5. delete_board_comment: 본인 수다방 댓글 삭제 API 신설
 * 6. handleBoardFetch: 댓글 date 필드 포함하도록 수정 (삭제 식별용)
 */

const DRIVE_FOLDER_ID = "10osneXcIBiNNhqH909jeLmBlYqc1cGQn";
// [신규 2026-04-19] 운영자 계정 — 랭킹 집계에서 제외
const OPERATOR_NICKS = ["쌍칼", "쌍칼(셔틀봇)", "서울시"];

function doGet(e) {
  // [수정 2026-04-20] 시트 초기화도 try 안쪽에서 → 어떤 예외든 JSON으로 리턴해 CORS 블럭 방지
  try {
    e = e || { parameter: {} };
    var p = e.parameter;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mainSheet = ss.getSheets()[0];
    var userSheet = getOrCreateSheet(ss, "users", ["아이디", "비밀번호"]);
    var boardSheet = getOrCreateSheet(ss, "board", ["ID", "작성자", "제목", "본문", "이미지URL", "링크", "날짜", "비번", "조회수", "추천수"]);
    var commentSheet = getOrCreateSheet(ss, "comments", ["대상ID", "작성자", "내용", "별점", "날짜"]);
    var boardCommentSheet = getOrCreateSheet(ss, "board_comments", ["게시글ID", "작성자", "내용", "날짜"]);
    // [신규 - 단계 4-3] 신고 시트: 3표(가중치 합 3) 이상이면 자동 숨김
    var boardReportsSheet = getOrCreateSheet(ss, "board_reports", ["게시글ID", "신고자", "신고자가중치", "신고일"]);
    var boardCmtReportsSheet = getOrCreateSheet(ss, "board_comment_reports", ["게시글ID", "댓글작성자", "댓글일시", "신고자", "신고자가중치", "신고일"]);
    // [신규 2026-04-20] 수다방 추천(좋아요) 시트 — 1인 1회 제약 (게시글ID+사용자)
    var boardLikesSheet = getOrCreateSheet(ss, "board_likes", ["게시글ID", "사용자", "비번", "날짜"]);
    // [신규 2026-04-25] 수다방 비추천 시트 — 1인 1회 제약, 추천과 상호배타
    var boardDislikesSheet = getOrCreateSheet(ss, "board_dislikes", ["게시글ID", "사용자", "비번", "날짜"]);
    // [신규 2026-04-25] 공지사항 시트 — 어드민(쌍칼)이 등록/삭제. 활성 공지가 첫 진입 모달에 노출됨.
    var noticeSheet = getOrCreateSheet(ss, "notices", ["ID", "제목", "본문", "작성자", "작성일", "활성여부"]);
    // [신규 2026-04-20] 방문자 카운터 시트 — 단일 row로 누적 카운트 관리
    var visitorSheet = null;
    try { visitorSheet = getOrCreateSheet(ss, "visitors", ["키", "값"]); }
    catch (vsErr) { console.warn("visitors 시트 초기화 실패:", vsErr.toString()); }
    // [신규 2026-04-20] 단속 떴다 신고 시트 — 30분 내 신고만 인포윈도우에 표시. 랭킹엔 영구 반영(+2.5점)
    // 시트 생성 실패해도 앱은 돌아가도록 null 폴백
    var crackdownSheet = null;
    try { crackdownSheet = getOrCreateSheet(ss, "crackdown_reports", ["대상ID", "작성자", "신고일", "비번"]); }
    catch (cdSheetErr) { console.warn("crackdown_reports 시트 초기화 실패:", cdSheetErr.toString()); }

    if (p.type === "get_board") return handleBoardFetch(boardSheet, boardCommentSheet, boardReportsSheet, boardCmtReportsSheet, boardLikesSheet, boardDislikesSheet);

    // [신규 2026-04-20] 조회수 +1
    if (p.type === "increment_view") {
      var ivPid = String(p.post_id || "").trim();
      if (!ivPid) return createResponse({res: "error", msg: "post_id 누락"});
      var ivRows = boardSheet.getDataRange().getValues();
      for (var ivI = 1; ivI < ivRows.length; ivI++) {
        if (String(ivRows[ivI][0]) === ivPid) {
          var ivCur = parseInt(ivRows[ivI][8]) || 0;
          boardSheet.getRange(ivI + 1, 9).setValue(ivCur + 1);
          return createResponse({res: "ok", viewCount: ivCur + 1});
        }
      }
      return createResponse({res: "error", msg: "게시글을 찾지 못했어요"});
    }

    // [신규 2026-04-20] 게시글 추천 (1인 1회)
    if (p.type === "add_like") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var lkPid = String(p.post_id || "").trim();
      if (!lkPid) return createResponse({res: "error", msg: "post_id 누락"});
      var lkRows = boardLikesSheet.getDataRange().getValues();
      for (var lkI = 1; lkI < lkRows.length; lkI++) {
        if (String(lkRows[lkI][0]) === lkPid && String(lkRows[lkI][1]) === String(p.user)) {
          return createResponse({res: "error", msg: "이미 이 게시글을 추천하셨습니다."});
        }
      }
      boardLikesSheet.appendRow([lkPid, p.user, p.pw, new Date()]);
      // 추천수 카운트 (게시판 시트에도 동기화, 선택적)
      var lkCount = 1;
      for (var lkI2 = 1; lkI2 < lkRows.length; lkI2++) {
        if (String(lkRows[lkI2][0]) === lkPid) lkCount++;
      }
      // boardSheet 의 10열(추천수)도 동기화
      var bRowsForLike = boardSheet.getDataRange().getValues();
      for (var bLk = 1; bLk < bRowsForLike.length; bLk++) {
        if (String(bRowsForLike[bLk][0]) === lkPid) {
          boardSheet.getRange(bLk + 1, 10).setValue(lkCount);
          break;
        }
      }
      return createResponse({res: "ok", likeCount: lkCount});
    }

    // [신규 2026-04-25] 게시글 추천 취소
    if (p.type === "remove_like") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var rlPid = String(p.post_id || "").trim();
      if (!rlPid) return createResponse({res: "error", msg: "post_id 누락"});
      var rlRows = boardLikesSheet.getDataRange().getValues();
      var rlRemoved = false;
      for (var rli = rlRows.length - 1; rli >= 1; rli--) {
        if (String(rlRows[rli][0]) === rlPid && String(rlRows[rli][1]) === String(p.user)) {
          boardLikesSheet.deleteRow(rli + 1);
          rlRemoved = true;
        }
      }
      // 추천수 재계산
      var rlAfter = boardLikesSheet.getDataRange().getValues();
      var rlCount = 0;
      for (var rli2 = 1; rli2 < rlAfter.length; rli2++) {
        if (String(rlAfter[rli2][0]) === rlPid) rlCount++;
      }
      var bRowsRl = boardSheet.getDataRange().getValues();
      for (var brl = 1; brl < bRowsRl.length; brl++) {
        if (String(bRowsRl[brl][0]) === rlPid) {
          boardSheet.getRange(brl + 1, 10).setValue(rlCount);
          break;
        }
      }
      return createResponse({res: "ok", likeCount: rlCount, removed: rlRemoved});
    }

    // [신규 2026-04-25] 게시글 비추 (1인 1회, 추천과 상호배타는 프론트에서 관리)
    if (p.type === "add_dislike") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var dkPid = String(p.post_id || "").trim();
      if (!dkPid) return createResponse({res: "error", msg: "post_id 누락"});
      var dkRows = boardDislikesSheet.getDataRange().getValues();
      for (var dki = 1; dki < dkRows.length; dki++) {
        if (String(dkRows[dki][0]) === dkPid && String(dkRows[dki][1]) === String(p.user)) {
          // 이미 있으면 카운트만 응답
          var dkExistCount = 0;
          for (var dkz = 1; dkz < dkRows.length; dkz++) if (String(dkRows[dkz][0]) === dkPid) dkExistCount++;
          return createResponse({res: "error", msg: "이미 이 게시글을 비추하셨습니다.", dislikeCount: dkExistCount});
        }
      }
      boardDislikesSheet.appendRow([dkPid, p.user, p.pw, new Date()]);
      var dkCount = 1;
      for (var dki2 = 1; dki2 < dkRows.length; dki2++) {
        if (String(dkRows[dki2][0]) === dkPid) dkCount++;
      }
      // 추천수도 함께 응답하면 프론트가 한 번에 갱신 가능
      var lkRecount = 0;
      var lkAll = boardLikesSheet.getDataRange().getValues();
      for (var lkrx = 1; lkrx < lkAll.length; lkrx++) if (String(lkAll[lkrx][0]) === dkPid) lkRecount++;
      return createResponse({res: "ok", dislikeCount: dkCount, likeCount: lkRecount});
    }

    // [신규 2026-04-25] 게시글 비추 취소
    if (p.type === "remove_dislike") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var rdPid = String(p.post_id || "").trim();
      if (!rdPid) return createResponse({res: "error", msg: "post_id 누락"});
      var rdRows = boardDislikesSheet.getDataRange().getValues();
      var rdRemoved = false;
      for (var rdi = rdRows.length - 1; rdi >= 1; rdi--) {
        if (String(rdRows[rdi][0]) === rdPid && String(rdRows[rdi][1]) === String(p.user)) {
          boardDislikesSheet.deleteRow(rdi + 1);
          rdRemoved = true;
        }
      }
      var rdAfter = boardDislikesSheet.getDataRange().getValues();
      var rdCount = 0;
      for (var rdi2 = 1; rdi2 < rdAfter.length; rdi2++) {
        if (String(rdAfter[rdi2][0]) === rdPid) rdCount++;
      }
      var lkR2 = 0;
      var lkAll2 = boardLikesSheet.getDataRange().getValues();
      for (var lkrz = 1; lkrz < lkAll2.length; lkrz++) if (String(lkAll2[lkrz][0]) === rdPid) lkR2++;
      return createResponse({res: "ok", dislikeCount: rdCount, likeCount: lkR2, removed: rdRemoved});
    }

    // [신규 2026-04-20] 특정 사용자가 추천한 게시글 ID 목록 (프론트 UI 상태 표시용)
    if (p.type === "get_my_likes") {
      var myUser = String(p.user || "").trim();
      if (!myUser) return createResponse([]);
      var mylRows = boardLikesSheet.getDataRange().getValues();
      var ids = [];
      for (var mli = 1; mli < mylRows.length; mli++) {
        if (String(mylRows[mli][1]) === myUser) ids.push(String(mylRows[mli][0]));
      }
      return createResponse(ids);
    }

    // [신규 - 단계 2] 랭킹 조회 (+ 단속 신고 점수 합산)
    if (p.type === "get_ranking") return handleRanking(mainSheet, commentSheet, crackdownSheet, boardSheet, boardCommentSheet);

    // [신규 2026-04-20] 방문자 수 조회 / +1 증가
    // - GET ?type=visitor_count         → 현재 값 반환만
    // - GET ?type=visitor_count&inc=1   → 값 +1 후 반환 (세션당 1회만 호출되도록 프론트에서 제어)
    // [수정 2026-04-21] TODAY 통계 추가
    //   키 구조: "total" = 전체 누적, "today_YYYY-MM-DD" = 당일 카운트
    //   응답: { res, total, today }
    if (p.type === "visitor_count") {
      if (!visitorSheet) return createResponse({res: "ok", total: 0, today: 0});
      var vRows = visitorSheet.getDataRange().getValues();
      var vRowIdx = -1, vTotal = 0;
      var tz = Session.getScriptTimeZone() || "Asia/Seoul";
      var todayKey = "today_" + Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
      var tRowIdx = -1, tToday = 0;
      for (var vi = 1; vi < vRows.length; vi++) {
        var k = String(vRows[vi][0]);
        if (k === "total")       { vRowIdx = vi; vTotal = parseInt(vRows[vi][1]) || 0; }
        else if (k === todayKey) { tRowIdx = vi; tToday = parseInt(vRows[vi][1]) || 0; }
      }
      if (vRowIdx < 0) {
        visitorSheet.appendRow(["total", 0]);
        vRowIdx = visitorSheet.getLastRow() - 1;
        vTotal = 0;
      }
      if (tRowIdx < 0) {
        visitorSheet.appendRow([todayKey, 0]);
        tRowIdx = visitorSheet.getLastRow() - 1;
        tToday = 0;
      }
      if (String(p.inc || "") === "1") {
        vTotal += 1;
        tToday += 1;
        visitorSheet.getRange(vRowIdx + 1, 2).setValue(vTotal);
        visitorSheet.getRange(tRowIdx + 1, 2).setValue(tToday);
      }
      return createResponse({res: "ok", total: vTotal, today: tToday});
    }

    if (p.type === "add_board_comment") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      boardCommentSheet.appendRow([p.post_id, p.user, p.comment, new Date()]);
      return createResponse({res: "ok"});
    }

    if (p.type === "report") {
      if (!checkUser(userSheet, p.user, p.pw)) return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      // [신규 2026-04-20] GET 경로: 이미지 URL만 있는 경우 Drive 재호스팅 후 저장 (파일 업로드는 POST 경로 사용)
      var imgUrlGet = "";
      if (p.image_url && /^https?:\/\//i.test(p.image_url)) {
        imgUrlGet = saveUrlToDrive(p.image_url, "gj_report_ext_" + new Date().getTime());
      }
      mainSheet.appendRow([p.user, p.name, p.ptype, p.addr, p.desc, p.lat, p.lng, new Date(), p.pw, imgUrlGet]);
      return createResponse({res: "ok", imageUrl: imgUrlGet});
    }

    if (p.type === "add_comment") {
      // [수정] 비번 검증 필수
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var targetId = String(p.target_id).trim();

      // [신규 - 단계 1] 자기 제보 후기 차단: mainSheet에서 해당 제보자 찾아 비교
      // mainSheet 스키마: [user, name, ptype, addr, desc, lat, lng, date, pw]
      var mainRowsSelf = mainSheet.getDataRange().getValues();
      for (var si = 1; si < mainRowsSelf.length; si++) {
        if (String(mainRowsSelf[si][1]).trim() === targetId
            && String(mainRowsSelf[si][0]) === String(p.user)) {
          return createResponse({res: "error", msg: "본인이 올린 제보에는 후기를 남길 수 없습니다."});
        }
      }

      // [수정] 아이디당 한 주차장에 후기 1개 규칙: 기존 후기 있으면 갱신, 없으면 신규 등록
      var cmtRows = commentSheet.getDataRange().getValues();
      var updated = false;
      for (var ci = 1; ci < cmtRows.length; ci++) {
        if (String(cmtRows[ci][0]).trim() === targetId && String(cmtRows[ci][1]) === String(p.user)) {
          commentSheet.getRange(ci + 1, 3).setValue(p.comment);
          commentSheet.getRange(ci + 1, 4).setValue(p.rating);
          commentSheet.getRange(ci + 1, 5).setValue(new Date());
          updated = true;
          break;
        }
      }
      if (!updated) {
        commentSheet.appendRow([targetId, p.user, p.comment, p.rating, new Date()]);
      }
      return createResponse({res: "ok", updated: updated});
    }

    // [신규 2026-04-20] 단속 떴다 신고 — 후기와 별개로 30분간 활성 경고 표출. 점수 +2.5.
    if (p.type === "add_crackdown") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var cdTargetId = String(p.target_id).trim();
      if (!cdTargetId) return createResponse({res: "error", msg: "대상 주차장이 지정되지 않았습니다."});

      // 30분 내 동일 유저 중복 신고 방지 (어뷰징 방지)
      var cdNow = new Date().getTime();
      var CD_WINDOW = 30 * 60 * 1000;
      var cdRows = crackdownSheet.getDataRange().getValues();
      for (var ci2 = 1; ci2 < cdRows.length; ci2++) {
        if (String(cdRows[ci2][0]).trim() === cdTargetId
            && String(cdRows[ci2][1]) === String(p.user)) {
          var cdAt = cdRows[ci2][2] instanceof Date ? cdRows[ci2][2].getTime() : new Date(cdRows[ci2][2]).getTime();
          if (cdNow - cdAt < CD_WINDOW) {
            return createResponse({res: "error", msg: "이미 최근 30분 내에 이 장소에 주차 주의를 등록하셨습니다."});
          }
        }
      }

      crackdownSheet.appendRow([cdTargetId, p.user, new Date(), p.pw]);
      return createResponse({res: "ok"});
    }

    if (p.type === "delete_comment") {
      // [신규] 후기 삭제: 본인만 삭제 가능 (target_id + user + pw 일치 시)
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var targetId2 = String(p.target_id).trim();
      var rows2 = commentSheet.getDataRange().getValues();
      for (var j = rows2.length - 1; j >= 1; j--) {
        if (String(rows2[j][0]).trim() === targetId2 && String(rows2[j][1]) === String(p.user)) {
          commentSheet.deleteRow(j + 1);
          return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "삭제할 후기를 찾을 수 없습니다."});
    }

    // [수정 2026-04-25] 주차 후기 수정 — 본인 한정. 200점 점수 게이트 폐지.
    if (p.type === "edit_comment") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      // [수정 2026-04-25] 200점 점수 게이트 폐지 — 본인 후기 수정은 누구나 가능
      //   본인 여부는 아래 루프에서 String(eRows[er][1]) === String(p.user) 로 검증한다.
      var eTargetId = String(p.target_id).trim();
      var eRows = commentSheet.getDataRange().getValues();
      for (var er = 1; er < eRows.length; er++) {
        if (String(eRows[er][0]).trim() === eTargetId && String(eRows[er][1]) === String(p.user)) {
          if (typeof p.comment !== 'undefined') commentSheet.getRange(er + 1, 3).setValue(p.comment);
          if (typeof p.rating !== 'undefined' && p.rating !== '') commentSheet.getRange(er + 1, 4).setValue(p.rating);
          commentSheet.getRange(er + 1, 5).setValue(new Date());
          return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "수정할 후기를 찾을 수 없습니다."});
    }

    // [신규 2026-04-25] 수다방 게시글 수정 (본인 한정 — 비번이 일치해야 함)
    //   * 제목·본문만 수정 가능. 이미지·작성자·날짜는 그대로 유지.
    //   * 비번 검증: 1) checkUser 통과 + 2) 게시글에 저장된 비번과 동일해야 함 (안전망 이중 체크)
    if (p.type === "edit_post") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var epPid = String(p.post_id || "").trim();
      if (!epPid) return createResponse({res: "error", msg: "post_id 누락"});
      var epRows = boardSheet.getDataRange().getValues();
      for (var ep = 1; ep < epRows.length; ep++) {
        if (String(epRows[ep][0]) === epPid) {
          if (String(epRows[ep][1]) !== String(p.user)) {
            return createResponse({res: "error", msg: "본인이 작성한 글만 수정할 수 있습니다."});
          }
          if (String(epRows[ep][7]) !== String(p.pw)) {
            return createResponse({res: "error", msg: "글 작성 시 사용한 비밀번호와 다릅니다."});
          }
          if (typeof p.title   !== 'undefined') boardSheet.getRange(ep + 1, 3).setValue(p.title);
          if (typeof p.content !== 'undefined') boardSheet.getRange(ep + 1, 4).setValue(p.content);
          return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "수정할 글을 찾을 수 없습니다."});
    }

    // [수정 2026-04-25] 수다방 댓글 수정 — 본인 한정. 점수 게이트 폐지.
    if (p.type === "edit_board_comment") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var ebRows = boardCommentSheet.getDataRange().getValues();
      var eTargetDate = String(p.date);
      for (var eb = 1; eb < ebRows.length; eb++) {
        var ebDate = ebRows[eb][3] instanceof Date ? ebRows[eb][3].toISOString() : String(ebRows[eb][3]);
        if (String(ebRows[eb][0]) === String(p.post_id)
            && String(ebRows[eb][1]) === String(p.user)
            && ebDate === eTargetDate) {
          boardCommentSheet.getRange(eb + 1, 3).setValue(p.comment);
          return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "수정할 댓글을 찾을 수 없습니다."});
    }

    if (p.type === "delete_board_comment") {
      // [신규] 수다방 댓글 삭제: post_id + user + date 조합으로 식별
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      var bcRows = boardCommentSheet.getDataRange().getValues();
      var targetDate = String(p.date);
      for (var k = bcRows.length - 1; k >= 1; k--) {
        var rowDate = bcRows[k][3] instanceof Date ? bcRows[k][3].toISOString() : String(bcRows[k][3]);
        if (String(bcRows[k][0]) === String(p.post_id)
            && String(bcRows[k][1]) === String(p.user)
            && rowDate === targetDate) {
          boardCommentSheet.deleteRow(k + 1);
          return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "삭제할 댓글을 찾을 수 없습니다."});
    }

    if (p.type === "delete_report") {
      var rows = mainSheet.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) {
        if (rows[i][1] == p.name && rows[i][5] == p.lat && rows[i][6] == p.lng) {
          if (String(rows[i][8]) === String(p.pw)) { mainSheet.deleteRow(i + 1); return createResponse({res: "ok"}); }
          else { return createResponse({res: "error", msg: "비밀번호 불일치"}); }
        }
      }
      return createResponse({res: "error", msg: "대상을 찾을 수 없음"});
    }

    // [신규 - 단계 4-3] 수다방 글 신고
    if (p.type === "report_post") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      // [수정 2026-04-25] 신고 권한 임계값 500 → 200, 가중치 2배 임계값 2000 → 1000
      var score = getUserScore(p.user, mainSheet, commentSheet);
      if (score < 200) {
        return createResponse({res: "error", msg: "신고 권한은 200점 이상 유저에게만 부여됩니다. (현재 " + score + "점)"});
      }
      var targetPost = null;
      var postRowsR = boardSheet.getDataRange().getValues();
      for (var rp = 1; rp < postRowsR.length; rp++) {
        if (String(postRowsR[rp][0]) === String(p.post_id)) { targetPost = postRowsR[rp]; break; }
      }
      if (!targetPost) return createResponse({res: "error", msg: "신고 대상 글을 찾을 수 없습니다."});
      if (String(targetPost[1]) === String(p.user)) {
        return createResponse({res: "error", msg: "본인이 작성한 글은 신고할 수 없습니다."});
      }
      // 중복 신고 방지
      var existReports = boardReportsSheet.getDataRange().getValues();
      for (var ex = 1; ex < existReports.length; ex++) {
        if (String(existReports[ex][0]) === String(p.post_id)
            && String(existReports[ex][1]) === String(p.user)) {
          return createResponse({res: "error", msg: "이미 신고하신 글입니다."});
        }
      }
      var weight = score >= 1000 ? 2 : 1; // [수정 2026-04-25] 1000점 이상 가중치 2배 (기존 2000)
      boardReportsSheet.appendRow([p.post_id, p.user, weight, new Date()]);
      return createResponse({res: "ok", weight: weight});
    }

    // [신규 - 단계 4-3] 수다방 댓글 신고
    if (p.type === "report_comment") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      // [수정 2026-04-25] 신고 권한 임계값 500 → 200
      var rscore = getUserScore(p.user, mainSheet, commentSheet);
      if (rscore < 200) {
        return createResponse({res: "error", msg: "신고 권한은 200점 이상 유저에게만 부여됩니다. (현재 " + rscore + "점)"});
      }
      // 대상 댓글 존재 확인 & 자기 댓글 신고 차단
      var bcRowsR = boardCommentSheet.getDataRange().getValues();
      var foundCmt = false;
      for (var bc = 1; bc < bcRowsR.length; bc++) {
        var cd = bcRowsR[bc][3] instanceof Date ? bcRowsR[bc][3].toISOString() : String(bcRowsR[bc][3]);
        if (String(bcRowsR[bc][0]) === String(p.post_id)
            && String(bcRowsR[bc][1]) === String(p.comment_user)
            && cd === String(p.date)) {
          if (String(bcRowsR[bc][1]) === String(p.user)) {
            return createResponse({res: "error", msg: "본인이 작성한 댓글은 신고할 수 없습니다."});
          }
          foundCmt = true;
          break;
        }
      }
      if (!foundCmt) return createResponse({res: "error", msg: "신고 대상 댓글을 찾을 수 없습니다."});

      // 중복 신고 방지
      var existCR = boardCmtReportsSheet.getDataRange().getValues();
      for (var ec = 1; ec < existCR.length; ec++) {
        var ecd = existCR[ec][2] instanceof Date ? existCR[ec][2].toISOString() : String(existCR[ec][2]);
        if (String(existCR[ec][0]) === String(p.post_id)
            && String(existCR[ec][1]) === String(p.comment_user)
            && ecd === String(p.date)
            && String(existCR[ec][3]) === String(p.user)) {
          return createResponse({res: "error", msg: "이미 신고하신 댓글입니다."});
        }
      }
      var rweight = rscore >= 1000 ? 2 : 1; // [수정 2026-04-25] 가중치 2배 임계값 2000 → 1000
      boardCmtReportsSheet.appendRow([p.post_id, p.comment_user, p.date, p.user, rweight, new Date()]);
      return createResponse({res: "ok", weight: rweight});
    }

    if (p.type === "delete_post") {
      var rows = boardSheet.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][0]) === String(p.post_id) && String(rows[i][7]) === String(p.pw)) {
          boardSheet.deleteRow(i + 1); return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "비밀번호 불일치"});
    }

    // =================================================
    // [신규 2026-04-25] 공지사항 어드민 API
    //   * get_notices : 활성 공지 전체(시간 역순)
    //   * add_notice  : 운영자(쌍칼) 전용 — 비번 검증 후 등록
    //   * delete_notice : 운영자 전용 — ID로 삭제(=활성여부 false)
    //   * toggle_notice : 활성/비활성 토글
    // =================================================
    if (p.type === "get_notices") {
      var ntRows = noticeSheet.getDataRange().getValues();
      var ntOut = [];
      for (var nt = ntRows.length - 1; nt >= 1; nt--) {
        var active = String(ntRows[nt][5]).toUpperCase();
        if (active === "FALSE" || active === "0" || active === "N") continue;
        ntOut.push({
          id: ntRows[nt][0],
          title: ntRows[nt][1],
          content: ntRows[nt][2],
          author: ntRows[nt][3],
          date: ntRows[nt][4] instanceof Date ? ntRows[nt][4].toISOString() : String(ntRows[nt][4])
        });
      }
      return createResponse(ntOut);
    }

    if (p.type === "get_all_notices") {
      // 어드민 페이지 전용 — 비활성 포함 전체 목록
      if (!isOperator(p.user) || !checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "운영자 권한이 필요합니다."});
      }
      var ntAll = noticeSheet.getDataRange().getValues();
      var ntAllOut = [];
      for (var nta = ntAll.length - 1; nta >= 1; nta--) {
        ntAllOut.push({
          id: ntAll[nta][0],
          title: ntAll[nta][1],
          content: ntAll[nta][2],
          author: ntAll[nta][3],
          date: ntAll[nta][4] instanceof Date ? ntAll[nta][4].toISOString() : String(ntAll[nta][4]),
          active: String(ntAll[nta][5]).toUpperCase() !== "FALSE" && String(ntAll[nta][5]) !== "0"
        });
      }
      return createResponse(ntAllOut);
    }

    if (p.type === "add_notice") {
      if (!isOperator(p.user)) {
        return createResponse({res: "error", msg: "운영자(쌍칼)만 공지를 등록할 수 있습니다."});
      }
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "비밀번호가 다릅니다."});
      }
      var antTitle = String(p.title || "").trim();
      var antContent = String(p.content || "").trim();
      if (!antTitle || !antContent) return createResponse({res: "error", msg: "제목과 본문을 입력해주세요."});
      var newNoticeId = "NOTICE_" + new Date().getTime();
      noticeSheet.appendRow([newNoticeId, antTitle, antContent, p.user, new Date(), true]);
      return createResponse({res: "ok", id: newNoticeId});
    }

    if (p.type === "delete_notice") {
      if (!isOperator(p.user) || !checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "운영자 권한이 필요합니다."});
      }
      var dnId = String(p.id || "").trim();
      if (!dnId) return createResponse({res: "error", msg: "id 누락"});
      var dnRows = noticeSheet.getDataRange().getValues();
      for (var dn = dnRows.length - 1; dn >= 1; dn--) {
        if (String(dnRows[dn][0]) === dnId) {
          noticeSheet.deleteRow(dn + 1);
          return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "공지를 찾을 수 없습니다."});
    }

    if (p.type === "toggle_notice") {
      if (!isOperator(p.user) || !checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "운영자 권한이 필요합니다."});
      }
      var tnId = String(p.id || "").trim();
      if (!tnId) return createResponse({res: "error", msg: "id 누락"});
      var tnRows = noticeSheet.getDataRange().getValues();
      for (var tn = 1; tn < tnRows.length; tn++) {
        if (String(tnRows[tn][0]) === tnId) {
          var cur = String(tnRows[tn][5]).toUpperCase();
          var next = (cur === "FALSE" || cur === "0" || cur === "N") ? true : false;
          noticeSheet.getRange(tn + 1, 6).setValue(next);
          return createResponse({res: "ok", active: next});
        }
      }
      return createResponse({res: "error", msg: "공지를 찾을 수 없습니다."});
    }

    return handleFetch(p, mainSheet, commentSheet, crackdownSheet);
  } catch (err) { return createResponse({res: "error", msg: err.toString()}); }
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userSheet = getOrCreateSheet(ss, "users", ["아이디", "비밀번호"]);

    if (!checkUser(userSheet, postData.user, postData.pw)) return createResponse({res: "error", msg: "비밀번호가 틀리거나 등록된 비번과 다릅니다."});

    // [신규 2026-04-20] 주차 제보도 POST로 받아 이미지 업로드(base64) 지원
    // 동일 엔드포인트에서 type 필드로 라우팅. type이 없으면 기존 add_post로 fallback.
    if (postData.type === "report") {
      var mainSheet = ss.getSheets()[0];
      var reportImg = "";
      if (postData.image_data && String(postData.image_data).length > 100) {
        reportImg = saveFileToDrive(postData.image_data, "gj_report_" + new Date().getTime());
      } else if (postData.image_url && /^https?:\/\//i.test(postData.image_url)) {
        reportImg = saveUrlToDrive(postData.image_url, "gj_report_ext_" + new Date().getTime());
      }
      mainSheet.appendRow([
        postData.user, postData.name, postData.ptype, postData.addr, postData.desc,
        postData.lat, postData.lng, new Date(), postData.pw, reportImg
      ]);
      return createResponse({res: "ok", imageUrl: reportImg});
    }

    // 기존: 수다방 글 등록 (add_post)
    var boardSheet = getOrCreateSheet(ss, "board", ["ID", "작성자", "제목", "본문", "이미지URL", "링크", "날짜", "비번"]);
    var imageUrl = "";
    if (postData.image_data && postData.image_data.length > 100) {
      imageUrl = saveFileToDrive(postData.image_data, "gj_img_" + new Date().getTime());
    } else if (postData.image_url && /^https?:\/\//i.test(postData.image_url)) {
      // [신규 2026-04-19] 외부 이미지 URL 프록시 저장
      // ruliweb 등 핫링크 차단 호스트 대응: 서버가 fetch해서 Drive에 사본 생성 후 Drive URL 반환
      imageUrl = saveUrlToDrive(postData.image_url, "gj_ext_" + new Date().getTime());
    }

    boardSheet.appendRow(["POST_" + new Date().getTime(), postData.user, postData.title, postData.content, imageUrl, "", new Date(), postData.pw]);
    return createResponse({res: "ok", url: imageUrl});
  } catch (err) { return createResponse({res: "error", msg: err.toString()}); }
}

function checkUser(sheet, user, pw) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == user) return String(data[i][1]) === String(pw);
  }
  sheet.appendRow([user, pw]); return true;
}

// [신규 2026-04-25] 운영자(쌍칼) 권한 판별 — 공지 등록·삭제·sky.html 진입 검증용
function isOperator(user) {
  if (!user) return false;
  return String(user) === "쌍칼";
}

function saveFileToDrive(base64Data, fileName) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var splitData = base64Data.split(',');
    var bytes = Utilities.base64Decode(splitData[1]);
    var mime = splitData[0].substring(5, splitData[0].indexOf(';'));

    // [수정 - webp 대응] MIME에 맞춰 확장자 자동 부여 (drive/thumbnail 엔드포인트가 확장자 없어도 동작하지만
    // 일부 CDN 경로에서 webp 전송 이슈 방지용)
    var extMap = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
    var ext = extMap[mime] || "";
    var safeName = fileName + ext;

    var blob = Utilities.newBlob(bytes, mime, safeName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // [수정 - webp 대응] drive.google.com/thumbnail 은 webp 포함 주요 이미지 포맷을 JPEG로 변환해 송출.
    // 브라우저 호환성이 가장 좋고, 핫링크도 정상 동작.
    return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
  } catch (e) { return ""; }
}

// [신규 2026-04-19] 외부 이미지 URL → 서버에서 fetch → Drive 저장 → Drive URL 반환
// 용도: ruliweb 등 Referer 기반 핫링크 차단을 우회.
// UrlFetchApp은 Google 서버에서 요청하므로 브라우저 Referer가 안 찍힘.
function saveUrlToDrive(imageUrl, fileName) {
  try {
    var response = UrlFetchApp.fetch(imageUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    var code = response.getResponseCode();
    if (code >= 400) {
      console.warn("외부 이미지 fetch 실패 (code " + code + "): " + imageUrl);
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
    console.warn("saveUrlToDrive 예외: " + e.toString());
    return "";
  }
}

function handleFetch(p, mainSheet, commentSheet, crackdownSheet) {
  try {
    // [신규 2026-04-20] 30분 내 활성 단속 신고 맵 (장소명 → {reportedAt, user})
    var CD_WINDOW = 30 * 60 * 1000;
    var nowMs = new Date().getTime();
    var activeCrackdowns = {};
    if (crackdownSheet) {
      var cdRows = crackdownSheet.getDataRange().getValues();
      for (var ci3 = 1; ci3 < cdRows.length; ci3++) {
        var target = String(cdRows[ci3][0]).trim();
        var at = cdRows[ci3][2] instanceof Date ? cdRows[ci3][2].getTime() : new Date(cdRows[ci3][2]).getTime();
        if (isNaN(at)) continue;
        if (nowMs - at < CD_WINDOW) {
          // 가장 최근 신고로 덮어씀 (만료 시점 계산 기준)
          if (!activeCrackdowns[target] || activeCrackdowns[target].at < at) {
            activeCrackdowns[target] = { at: at, user: String(cdRows[ci3][1]) };
          }
        }
      }
    }

    // [수정] 서울시 API: HTTP 환원, 응답 구조 안전 체크 + 진단 모드
    // [신규 2026-04-20] CacheService로 10분 TTL 캐시 → 외부 API 왕복(1~3초) 제거해 로딩 속도 개선
    if (p.type === "seoul") {
      var url = "http://openapi.seoul.go.kr:8088/48464f6b62616c663130336f6d695477/json/GetParkInfo/1/1000/";
      var debugMode = String(p.debug || "") === "1";
      try {
        // [신규] 파싱·필터링 끝난 slim 데이터만 캐시 (원본 ~500KB라 CacheService 100KB 한도 초과 방지)
        //   후기/단속은 캐시 안 씀 → 매 호출 시 별도 병합으로 최신 유지
        var seoulCache = CacheService.getScriptCache();
        var cacheKey = 'seoul_base_v1';
        var cachedStr = debugMode ? null : seoulCache.get(cacheKey);
        var seoulBase = null;
        if (cachedStr) {
          try { seoulBase = JSON.parse(cachedStr); }
          catch (e) { seoulBase = null; }
        }

        if (!seoulBase) {
          var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
          var statusCode = res.getResponseCode();
          var bodyText = res.getContentText();
          var parsed;
          try { parsed = JSON.parse(bodyText); }
          catch (parseErr) {
            if (debugMode) return createResponse({ stage: "parse", statusCode: statusCode, bodyPreview: String(bodyText).substring(0, 500), error: parseErr.toString() });
            console.warn("서울시 API JSON 파싱 실패:", parseErr.toString(), " body:", String(bodyText).substring(0, 200));
            return createResponse([]);
          }

          if (debugMode) {
            return createResponse({
              stage: "ok",
              statusCode: statusCode,
              topKeys: Object.keys(parsed || {}),
              resultCode: parsed && parsed.GetParkInfo && parsed.GetParkInfo.RESULT ? parsed.GetParkInfo.RESULT.CODE : (parsed && parsed.RESULT ? parsed.RESULT.CODE : null),
              resultMsg:  parsed && parsed.GetParkInfo && parsed.GetParkInfo.RESULT ? parsed.GetParkInfo.RESULT.MESSAGE : (parsed && parsed.RESULT ? parsed.RESULT.MESSAGE : null),
              totalCount: parsed && parsed.GetParkInfo ? parsed.GetParkInfo.list_total_count : null,
              rowLen: parsed && parsed.GetParkInfo && parsed.GetParkInfo.row ? parsed.GetParkInfo.row.length : 0,
              firstRow: parsed && parsed.GetParkInfo && parsed.GetParkInfo.row && parsed.GetParkInfo.row[0] ? parsed.GetParkInfo.row[0] : null,
              bodyPreview: String(bodyText).substring(0, 300)
            });
          }

          if (!parsed.GetParkInfo || !parsed.GetParkInfo.row) {
            console.warn("서울시 API 응답 구조 이상:", JSON.stringify(parsed).substring(0, 300));
            return createResponse([]);
          }

          // 필요한 필드만 추려서 slim 캐시 저장
          seoulBase = parsed.GetParkInfo.row
            .filter(function(r) { return (r.PAY_YN === "N" || r.CHGD_FREE_NM === "무료") && r.LAT; })
            .map(function(r) {
              return {
                name: r.PKLT_NM,
                address: r.ADDR,
                lat: parseFloat(r.LAT),
                lng: parseFloat(r.LOT)
              };
            });

          // 캐시에 저장 (10분). 100KB 초과 시 조용히 건너뜀
          try { seoulCache.put(cacheKey, JSON.stringify(seoulBase), 600); }
          catch (putErr) { console.warn("서울 캐시 저장 실패(크기 초과 가능):", putErr.toString()); }
        }

        // 후기/단속은 매 호출 시 최신 병합 (캐시 안 함)
        var seoulCmtRows = commentSheet.getDataRange().getValues();
        var seoulCmtByName = {};
        for (var sci = 1; sci < seoulCmtRows.length; sci++) {
          var scKey = String(seoulCmtRows[sci][0] || '').trim();
          if (!scKey) continue;
          if (!seoulCmtByName[scKey]) seoulCmtByName[scKey] = [];
          seoulCmtByName[scKey].push({
            user: seoulCmtRows[sci][1],
            comment: seoulCmtRows[sci][2],
            rating: seoulCmtRows[sci][3]
          });
        }

        return createResponse(seoulBase.map(function(b) {
          var nm = String(b.name || '').trim();
          var cdInfo = activeCrackdowns[nm];
          var matched = seoulCmtByName[nm] || [];
          var totalRate = 0;
          for (var mi = 0; mi < matched.length; mi++) totalRate += parseFloat(matched[mi].rating || 0);
          var avg = matched.length > 0 ? (totalRate / matched.length).toFixed(1) : "0.0";
          return {
            name: b.name, address: b.address,
            lat: b.lat, lng: b.lng,
            type: "무료", user: "서울시", desc: "공공데이터",
            imageUrl: "",
            avgRating: avg, comments: matched,
            crackdownActive: !!cdInfo,
            crackdownAt: cdInfo ? new Date(cdInfo.at).toISOString() : null,
            crackdownBy: cdInfo ? cdInfo.user : null
          };
        }));
      } catch (seoulErr) {
        if (debugMode) return createResponse({ stage: "fetch", error: seoulErr.toString() });
        console.warn("서울시 API 호출 실패:", seoulErr.toString());
        return createResponse([]);
      }
    }

    var mainRows = mainSheet.getDataRange().getValues();
    if (mainRows.length <= 1) return createResponse([]);

    var commentRows = commentSheet.getDataRange().getValues().length > 1
      ? commentSheet.getDataRange().getValues().slice(1)
      : [];

    var list = mainRows.slice(1).map(function(r) {
      var placeName = String(r[1]).trim();
      var matchedComments = commentRows.filter(function(c) { return String(c[0]).trim() === placeName; });
      var totalRate = 0;
      var cList = matchedComments.map(function(c) {
        totalRate += parseFloat(c[3] || 0);
        return { user: c[1], comment: c[2], rating: c[3] };
      });
      var avg = matchedComments.length > 0 ? (totalRate / matchedComments.length).toFixed(1) : "0.0";

      // [신규 2026-04-20] 활성 단속 정보 주입
      var cdInfo = activeCrackdowns[placeName];

      return {
        user: r[0], name: r[1], type: r[2], address: r[3], desc: r[4],
        lat: parseFloat(r[5]), lng: parseFloat(r[6]),
        imageUrl: r[9] || "", // [추가 2026-04-20] 주차 이미지 (컬럼 J). 없으면 빈 문자열 → 프론트에서 기본 이미지 표시
        avgRating: avg, comments: cList,
        crackdownActive: !!cdInfo,
        crackdownAt: cdInfo ? new Date(cdInfo.at).toISOString() : null,
        crackdownBy: cdInfo ? cdInfo.user : null
      };
    });

    return createResponse(list);

  } catch (e) {
    console.error("🚨 [handleFetch 에러] " + e.toString());
    return createResponse([]);
  }
}

function handleBoardFetch(boardSheet, boardCommentSheet, boardReportsSheet, boardCmtReportsSheet, boardLikesSheet, boardDislikesSheet) {
  var posts = boardSheet.getDataRange().getValues().slice(1).reverse();
  var allCmts = boardCommentSheet.getDataRange().getValues().length > 1
    ? boardCommentSheet.getDataRange().getValues().slice(1)
    : [];

  // [신규 2026-04-20] 추천수 집계 (board_likes 기준 — 게시판 시트와 동기화되지 않더라도 정확)
  var likesMap = {};
  if (boardLikesSheet) {
    var lkAllRows = boardLikesSheet.getDataRange().getValues();
    for (var lkA = 1; lkA < lkAllRows.length; lkA++) {
      var lkId = String(lkAllRows[lkA][0]);
      likesMap[lkId] = (likesMap[lkId] || 0) + 1;
    }
  }
  // [신규 2026-04-25] 비추수 집계
  var dislikesMap = {};
  if (boardDislikesSheet) {
    var dkAllRows = boardDislikesSheet.getDataRange().getValues();
    for (var dkA = 1; dkA < dkAllRows.length; dkA++) {
      var dkId = String(dkAllRows[dkA][0]);
      dislikesMap[dkId] = (dislikesMap[dkId] || 0) + 1;
    }
  }

  // [신규 - 단계 4-3] 신고 가중치 합산 (3 이상이면 숨김)
  var postReportMap = {};  // postId → 가중치 합
  var cmtReportMap = {};   // postId|user|dateISO → 가중치 합
  if (boardReportsSheet) {
    var prRows = boardReportsSheet.getDataRange().getValues();
    for (var a = 1; a < prRows.length; a++) {
      var pid = String(prRows[a][0]);
      var w = parseFloat(prRows[a][2] || 1);
      postReportMap[pid] = (postReportMap[pid] || 0) + w;
    }
  }
  if (boardCmtReportsSheet) {
    var crRows = boardCmtReportsSheet.getDataRange().getValues();
    for (var b = 1; b < crRows.length; b++) {
      var cpid = String(crRows[b][0]);
      var cu = String(crRows[b][1]);
      var cd = crRows[b][2] instanceof Date ? crRows[b][2].toISOString() : String(crRows[b][2]);
      var cw = parseFloat(crRows[b][4] || 1);
      var key = cpid + "|" + cu + "|" + cd;
      cmtReportMap[key] = (cmtReportMap[key] || 0) + cw;
    }
  }
  var HIDE_THRESHOLD = 3;

  var data = posts.filter(function(pos) {
    // 숨김 처리된 글은 응답에서 제외
    return (postReportMap[String(pos[0])] || 0) < HIDE_THRESHOLD;
  }).map(function(pos) {
    var postId = pos[0];
    var matched = allCmts.filter(function(c) {
      if (String(c[0]) !== String(postId)) return false;
      var d = c[3] instanceof Date ? c[3].toISOString() : String(c[3]);
      var key = String(postId) + "|" + String(c[1]) + "|" + d;
      return (cmtReportMap[key] || 0) < HIDE_THRESHOLD;
    });
    return {
      id: postId,
      author: pos[1],
      title: pos[2],
      content: pos[3],
      imageUrl: pos[4],
      date: pos[6],
      // [신규 2026-04-20] 조회수·추천수 노출 (구 스키마 방어: 빈 셀이면 0)
      viewCount: parseInt(pos[8]) || 0,
      likeCount: likesMap[String(postId)] || parseInt(pos[9]) || 0,
      // [신규 2026-04-25] 비추수
      dislikeCount: dislikesMap[String(postId)] || 0,
      // [수정] date 포함 (삭제·신고 식별용). ISO 문자열로 통일.
      comments: matched.map(function(c) {
        var d = c[3] instanceof Date ? c[3].toISOString() : String(c[3]);
        return { user: c[1], text: c[2], date: d };
      })
    };
  });
  return createResponse(data);
}

// [신규 2026-04-21] 무의미한 게시글 필터 — 스팸 글로 점수 적립 방지
//   1) 본문이 비어있으면 → 이미지가 반드시 있어야 점수 인정
//   2) 본문이 있으면 공백 제거 후 5자 이상 & 고유 문자 3종 이상 있어야 인정
//      (ㅋㅋㅋ, ㅎㅎㅎ, aaaa, 1111 등의 반복 차단)
function isMeaningfulBoardPost(title, content, imageUrl) {
  var c = String(content || "").replace(/\s+/g, "");
  var hasImage = !!(imageUrl && String(imageUrl).trim());
  if (!c) return hasImage;
  if (c.length < 5) return false;
  var charSet = {};
  for (var i = 0; i < c.length; i++) charSet[c.charAt(i)] = 1;
  if (Object.keys(charSet).length < 3) return false;
  return true;
}

// [신규 - 단계 4-3] 유저 점수 계산 (신고 권한/가중치 판정용)
// 공식: (제보 수 × 5) + (받은 별점 합계) + (단속 신고 × 2.5) + (유효 수다방 글 × 5)
//       + (주차 후기 작성 × 2.5) + (수다방 댓글 × 2.5), 자기 후기 제외
function getUserScore(user, mainSheet, commentSheet) {
  if (!user) return 0;
  var mainRows = mainSheet.getDataRange().getValues();
  var cmtRows = commentSheet.getDataRange().getValues();

  var myPlaces = {};
  var reportCount = 0;
  for (var i = 1; i < mainRows.length; i++) {
    if (String(mainRows[i][0]) === String(user)) {
      reportCount++;
      myPlaces[String(mainRows[i][1]).trim()] = true;
    }
  }

  var reviewSum = 0;                // 내 장소에 달린 후기 별점 합 (받은 쪽)
  var reviewGivenCount = 0;         // [신규 2026-04-21] 내가 쓴 주차 후기 건수 (준 쪽)
  for (var j = 1; j < cmtRows.length; j++) {
    var target = String(cmtRows[j][0]).trim();
    var reviewer = String(cmtRows[j][1]);
    if (reviewer === String(user)) {
      if (!myPlaces[target]) reviewGivenCount++; // 자기 제보 후기는 받는 쪽 차단 + 주는 쪽도 제외
      continue;
    }
    if (!myPlaces[target]) continue;
    reviewSum += parseFloat(cmtRows[j][3] || 0);
  }

  // [신규 2026-04-20] 단속 신고 점수 (+2.5 per)
  var crackdownCount = 0;
  try {
    var cdSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("crackdown_reports");
    if (cdSheet) {
      var cdRows = cdSheet.getDataRange().getValues();
      for (var k = 1; k < cdRows.length; k++) {
        if (String(cdRows[k][1]) === String(user)) crackdownCount++;
      }
    }
  } catch (e) { /* 시트 없으면 0 */ }

  // [신규 2026-04-21] 수다방 유효 글 (+5 per) — board 스키마: [ID, 작성자, 제목, 본문, 이미지URL, 링크, 날짜, ...]
  var validPostCount = 0;
  try {
    var bSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("board");
    if (bSheet) {
      var bRows = bSheet.getDataRange().getValues();
      for (var b = 1; b < bRows.length; b++) {
        if (String(bRows[b][1]) !== String(user)) continue;
        if (isMeaningfulBoardPost(bRows[b][2], bRows[b][3], bRows[b][4])) validPostCount++;
      }
    }
  } catch (e) { /* 시트 없으면 0 */ }

  // [신규 2026-04-21] 수다방 댓글 (+2.5 per) — board_comments 스키마: [게시글ID, 작성자, 내용, 날짜]
  var boardCmtCount = 0;
  try {
    var bcSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("board_comments");
    if (bcSheet) {
      var bcRows = bcSheet.getDataRange().getValues();
      for (var bc = 1; bc < bcRows.length; bc++) {
        if (String(bcRows[bc][1]) !== String(user)) continue;
        var cmtText = String(bcRows[bc][2] || "").trim();
        if (cmtText.length >= 2) boardCmtCount++; // 지나치게 짧은 댓글은 제외
      }
    }
  } catch (e) { /* 시트 없으면 0 */ }

  return (reportCount * 5) + reviewSum + (crackdownCount * 2.5)
       + (validPostCount * 5) + (reviewGivenCount * 2.5) + (boardCmtCount * 2.5);
}

// [신규 - 단계 2] 랭킹 계산
// 점수 공식: (제보 수 × 5) + (내 제보에 받은 별점 합계) + (단속 신고 × 2.5)
//           [신규 2026-04-21] + (수다방 유효 글 × 5) + (주차 후기 작성 × 2.5) + (수다방 댓글 × 2.5)
// 정렬: 점수 desc → 제보 수 desc → 첫 제보일 asc
function handleRanking(mainSheet, commentSheet, crackdownSheet, boardSheet, boardCommentSheet) {
  try {
    var mainRows = mainSheet.getDataRange().getValues();
    var cmtRows = commentSheet.getDataRange().getValues();

    var userStats = {};
    var placeToAuthor = {}; // 제보 장소명 → 제보자 아이디

    function ensureUser(u) {
      if (!userStats[u]) {
        userStats[u] = {
          user: u, reportCount: 0, reviewCount: 0, reviewSum: 0,
          crackdownCount: 0,
          postCount: 0,          // [신규 2026-04-21] 유효 수다방 글 수
          reviewGivenCount: 0,   // [신규 2026-04-21] 내가 작성한 주차 후기 수
          boardCmtCount: 0,      // [신규 2026-04-21] 수다방 댓글 수
          firstReportDate: null
        };
      }
      return userStats[u];
    }

    // 제보 집계
    for (var i = 1; i < mainRows.length; i++) {
      var u = String(mainRows[i][0]);
      if (!u) continue;
      // [신규 2026-04-19] 운영자 계정은 랭킹 집계에서 완전 배제
      if (OPERATOR_NICKS.indexOf(u) !== -1) continue;
      var placeName = String(mainRows[i][1]).trim();
      var reportDate = mainRows[i][7];

      var s1 = ensureUser(u);
      s1.reportCount += 1;
      if (reportDate) {
        var rd = reportDate instanceof Date ? reportDate.getTime() : new Date(reportDate).getTime();
        if (!s1.firstReportDate || rd < s1.firstReportDate) {
          s1.firstReportDate = rd;
        }
      }
      // 동일 장소명이 여러 제보에 있으면 마지막 것으로 덮어씀 (실질 영향 미미)
      placeToAuthor[placeName] = u;
    }

    // 후기 집계
    //   - 받는 쪽(제보자): 자기 후기 제외 + 합산
    //   - 주는 쪽(작성자): 2.5점 per, 자기 장소 후기는 주는 쪽도 제외(어뷰징 방지)
    for (var j = 1; j < cmtRows.length; j++) {
      var target = String(cmtRows[j][0]).trim();
      var reviewer = String(cmtRows[j][1]);
      var rating = parseFloat(cmtRows[j][3] || 0);
      var author = placeToAuthor[target];
      if (!reviewer) continue;
      if (OPERATOR_NICKS.indexOf(reviewer) !== -1) continue;

      // 받는 쪽 집계
      if (author && author !== reviewer && userStats[author]) {
        userStats[author].reviewCount += 1;
        userStats[author].reviewSum += rating;
      }
      // 주는 쪽 집계 (자기 장소 제외)
      if (!author || author !== reviewer) {
        ensureUser(reviewer).reviewGivenCount += 1;
      }
    }

    // [신규 2026-04-20] 단속 신고 집계 (+2.5점 per). 운영자 계정 제외.
    if (crackdownSheet) {
      var cdRows2 = crackdownSheet.getDataRange().getValues();
      for (var k = 1; k < cdRows2.length; k++) {
        var reporter = String(cdRows2[k][1]);
        if (!reporter) continue;
        if (OPERATOR_NICKS.indexOf(reporter) !== -1) continue;
        ensureUser(reporter).crackdownCount += 1;
      }
    }

    // [신규 2026-04-21] 수다방 유효 글 집계 (+5점 per) — 스팸 필터 통과한 글만 인정
    if (boardSheet) {
      var bRows3 = boardSheet.getDataRange().getValues();
      for (var bb = 1; bb < bRows3.length; bb++) {
        var bAuthor = String(bRows3[bb][1] || "");
        if (!bAuthor) continue;
        if (OPERATOR_NICKS.indexOf(bAuthor) !== -1) continue;
        if (isMeaningfulBoardPost(bRows3[bb][2], bRows3[bb][3], bRows3[bb][4])) {
          ensureUser(bAuthor).postCount += 1;
        }
      }
    }

    // [신규 2026-04-21] 수다방 댓글 집계 (+2.5점 per)
    if (boardCommentSheet) {
      var bcRows3 = boardCommentSheet.getDataRange().getValues();
      for (var bcc = 1; bcc < bcRows3.length; bcc++) {
        var bcAuthor = String(bcRows3[bcc][1] || "");
        if (!bcAuthor) continue;
        if (OPERATOR_NICKS.indexOf(bcAuthor) !== -1) continue;
        var bcText = String(bcRows3[bcc][2] || "").trim();
        if (bcText.length < 2) continue; // 지나치게 짧은 댓글 제외
        ensureUser(bcAuthor).boardCmtCount += 1;
      }
    }

    // 점수 계산 및 배열화
    var users = Object.keys(userStats).map(function(u) {
      var s = userStats[u];
      s.score = (s.reportCount * 5)
              + s.reviewSum
              + ((s.crackdownCount || 0) * 2.5)
              + ((s.postCount || 0) * 5)
              + ((s.reviewGivenCount || 0) * 2.5)
              + ((s.boardCmtCount || 0) * 2.5);
      s.avgRating = s.reviewCount > 0 ? (s.reviewSum / s.reviewCount).toFixed(1) : "0.0";
      return s;
    });

    // 정렬
    users.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
      if (a.firstReportDate && b.firstReportDate) return a.firstReportDate - b.firstReportDate;
      return 0;
    });

    // 순위 부여
    users.forEach(function(u, idx) { u.rank = idx + 1; });

    return createResponse(users);
  } catch (e) {
    console.error("🚨 [handleRanking 에러] " + e.toString());
    return createResponse([]);
  }
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); }
  return sheet;
}

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * [신규 2026-04-20] 외부 URL 권한(script.external_request) 동의를 트리거하기 위한 1회용 함수.
 * Apps Script 에디터 상단 드롭다운에서 이 함수(authorizeExternalFetch)를 선택하고 "실행"을 누르세요.
 * OAuth 동의 팝업이 뜨면 "허용" → 이후 UrlFetchApp.fetch가 deployment에서 동작합니다.
 * 한 번만 실행하면 되고, 이후 배포 업데이트 시에도 권한은 유지됩니다.
 */
function authorizeExternalFetch() {
  var testUrl = "http://openapi.seoul.go.kr:8088/48464f6b62616c663130336f6d695477/json/GetParkInfo/1/1/";
  var res = UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
  Logger.log("statusCode: " + res.getResponseCode());
  Logger.log("body preview: " + res.getContentText().substring(0, 300));
  return res.getResponseCode();
}
