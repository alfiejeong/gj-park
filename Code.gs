/**
 * [거지주차.com] 백엔드 통합 엔진 (V.2026.04 댓글무결성판)
 *
 * 수정 사항:
 * 1. 서울시 API URL을 HTTPS로 변경 (HTTP → HTTPS)
 * 2. 서울시 API 응답 구조 안전 체크 추가 (GetParkInfo 없을 때 빈 배열 반환)
 * 3. add_comment: 아이디당 한 주차장에 후기 1개로 제한 (기존 있으면 갱신)
 * 4. delete_comment: 본인 후기 삭제 API 신설
 * 5. delete_board_comment: 본인 수다방 댓글 삭제 API 신설
 * 6. handleBoardFetch: 댓글 date 필드 포함하도록 수정 (삭제 식별용)
 */

const DRIVE_FOLDER_ID = "10osneXcIBiNNhqH909jeLmBlYqc1cGQn";

function doGet(e) {
  e = e || { parameter: {} };
  var p = e.parameter;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = ss.getSheets()[0];
  var userSheet = getOrCreateSheet(ss, "users", ["아이디", "비밀번호"]);
  var boardSheet = getOrCreateSheet(ss, "board", ["ID", "작성자", "제목", "본문", "이미지URL", "링크", "날짜", "비번"]);
  var commentSheet = getOrCreateSheet(ss, "comments", ["대상ID", "작성자", "내용", "별점", "날짜"]);
  var boardCommentSheet = getOrCreateSheet(ss, "board_comments", ["게시글ID", "작성자", "내용", "날짜"]);

  try {
    if (p.type === "get_board") return handleBoardFetch(boardSheet, boardCommentSheet);

    // [신규 - 단계 2] 랭킹 조회
    if (p.type === "get_ranking") return handleRanking(mainSheet, commentSheet);

    if (p.type === "add_board_comment") {
      if (!checkUser(userSheet, p.user, p.pw)) {
        return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      }
      boardCommentSheet.appendRow([p.post_id, p.user, p.comment, new Date()]);
      return createResponse({res: "ok"});
    }

    if (p.type === "report") {
      if (!checkUser(userSheet, p.user, p.pw)) return createResponse({res: "error", msg: "기존 비밀번호와 일치하지 않는 아이디입니다."});
      mainSheet.appendRow([p.user, p.name, p.ptype, p.addr, p.desc, p.lat, p.lng, new Date(), p.pw]);
      return createResponse({res: "ok"});
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

    if (p.type === "delete_post") {
      var rows = boardSheet.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][0]) === String(p.post_id) && String(rows[i][7]) === String(p.pw)) {
          boardSheet.deleteRow(i + 1); return createResponse({res: "ok"});
        }
      }
      return createResponse({res: "error", msg: "비밀번호 불일치"});
    }

    return handleFetch(p, mainSheet, commentSheet);
  } catch (err) { return createResponse({res: "error", msg: err.toString()}); }
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userSheet = getOrCreateSheet(ss, "users", ["아이디", "비밀번호"]);
    var boardSheet = getOrCreateSheet(ss, "board", ["ID", "작성자", "제목", "본문", "이미지URL", "링크", "날짜", "비번"]);

    if (!checkUser(userSheet, postData.user, postData.pw)) return createResponse({res: "error", msg: "비밀번호가 틀리거나 등록된 비번과 다릅니다."});

    var imageUrl = "";
    if (postData.image_data && postData.image_data.length > 100) {
      imageUrl = saveFileToDrive(postData.image_data, "gj_img_" + new Date().getTime());
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

function saveFileToDrive(base64Data, fileName) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var splitData = base64Data.split(',');
    var bytes = Utilities.base64Decode(splitData[1]);
    var blob = Utilities.newBlob(bytes, splitData[0].substring(5, splitData[0].indexOf(';')), fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://docs.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
  } catch (e) { return ""; }
}

function handleFetch(p, mainSheet, commentSheet) {
  try {
    // [수정] 서울시 API: HTTP → HTTPS, 응답 구조 안전 체크 추가
    if (p.type === "seoul") {
      var url = "https://openapi.seoul.go.kr:8088/7353726f51616c663130305873426c73/json/GetParkInfo/1/1000/";
      try {
        var res = UrlFetchApp.fetch(url);
        var parsed = JSON.parse(res.getContentText());

        // [추가] 응답 구조 유효성 체크
        if (!parsed.GetParkInfo || !parsed.GetParkInfo.row) {
          console.warn("서울시 API 응답 구조 이상:", JSON.stringify(parsed).substring(0, 200));
          return createResponse([]);
        }

        var rows = parsed.GetParkInfo.row;
        return createResponse(rows.filter(function(r) {
          return (r.PAY_YN === "N" || r.CHGD_FREE_NM === "무료") && r.LAT;
        }).map(function(r) {
          return {
            name: r.PKLT_NM, address: r.ADDR,
            lat: parseFloat(r.LAT), lng: parseFloat(r.LOT),
            type: "무료", user: "서울시", desc: "공공데이터",
            avgRating: "5.0", comments: []
          };
        }));
      } catch (seoulErr) {
        console.warn("서울시 API 호출 실패:", seoulErr.toString());
        return createResponse([]); // 서울시 API 실패해도 앱은 살림
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

      return {
        user: r[0], name: r[1], type: r[2], address: r[3], desc: r[4],
        lat: parseFloat(r[5]), lng: parseFloat(r[6]),
        avgRating: avg, comments: cList
      };
    });

    return createResponse(list);

  } catch (e) {
    console.error("🚨 [handleFetch 에러] " + e.toString());
    return createResponse([]);
  }
}

function handleBoardFetch(boardSheet, boardCommentSheet) {
  var posts = boardSheet.getDataRange().getValues().slice(1).reverse();
  var allCmts = boardCommentSheet.getDataRange().getValues().length > 1
    ? boardCommentSheet.getDataRange().getValues().slice(1)
    : [];

  var data = posts.map(function(pos) {
    var postId = pos[0];
    var matched = allCmts.filter(function(c) { return String(c[0]) === String(postId); });
    return {
      id: postId,
      author: pos[1],
      title: pos[2],
      content: pos[3],
      imageUrl: pos[4],
      date: pos[6],
      // [수정] date 포함 (삭제 식별용). ISO 문자열로 통일.
      comments: matched.map(function(c) {
        var d = c[3] instanceof Date ? c[3].toISOString() : String(c[3]);
        return { user: c[1], text: c[2], date: d };
      })
    };
  });
  return createResponse(data);
}

// [신규 - 단계 2] 랭킹 계산
// 점수 공식: (제보 수 × 5) + (내 제보에 받은 별점 합계) — 자기 후기는 제외
// 정렬: 점수 desc → 제보 수 desc → 첫 제보일 asc
function handleRanking(mainSheet, commentSheet) {
  try {
    var mainRows = mainSheet.getDataRange().getValues();
    var cmtRows = commentSheet.getDataRange().getValues();

    var userStats = {};
    var placeToAuthor = {}; // 제보 장소명 → 제보자 아이디

    // 제보 집계
    for (var i = 1; i < mainRows.length; i++) {
      var u = String(mainRows[i][0]);
      if (!u) continue;
      var placeName = String(mainRows[i][1]).trim();
      var reportDate = mainRows[i][7];

      if (!userStats[u]) {
        userStats[u] = {
          user: u, reportCount: 0, reviewCount: 0, reviewSum: 0, firstReportDate: null
        };
      }
      userStats[u].reportCount += 1;
      if (reportDate) {
        var rd = reportDate instanceof Date ? reportDate.getTime() : new Date(reportDate).getTime();
        if (!userStats[u].firstReportDate || rd < userStats[u].firstReportDate) {
          userStats[u].firstReportDate = rd;
        }
      }
      // 동일 장소명이 여러 제보에 있으면 마지막 것으로 덮어씀 (실질 영향 미미)
      placeToAuthor[placeName] = u;
    }

    // 후기 집계 (자기 후기 제외)
    for (var j = 1; j < cmtRows.length; j++) {
      var target = String(cmtRows[j][0]).trim();
      var reviewer = String(cmtRows[j][1]);
      var rating = parseFloat(cmtRows[j][3] || 0);
      var author = placeToAuthor[target];
      if (!author) continue;           // 서울시 API 등 사용자 제보 아닌 대상은 집계 제외
      if (author === reviewer) continue; // 자기 후기 점수 제외 (단계 1로 신규 유입은 차단됐지만 기존 데이터 방어)
      if (!userStats[author]) continue;
      userStats[author].reviewCount += 1;
      userStats[author].reviewSum += rating;
    }

    // 점수 계산 및 배열화
    var users = Object.keys(userStats).map(function(u) {
      var s = userStats[u];
      s.score = (s.reportCount * 5) + s.reviewSum;
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
