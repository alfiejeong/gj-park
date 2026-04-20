/**
 * 거지주차.com 통합 스크립트 (V.버그수정본)
 *
 * 수정 사항:
 * 1. renderBoardWithHistory 함수 중복 선언 제거
 * 2. toggleLoading: hidden 제거 시 display:flex 명시적으로 설정
 * 3. hideSplashScreen Race Condition 해결: 양쪽 조건 모두 충족 시에만 닫힘
 * 4. fetchBoard 미정의 함수 추가
 * 5. onpopstate: 지도 화면에서 뒤로가기 이탈 방지
 * 6. pickMarker null 체크 추가 (submitReport)
 * 7. submitReport 성공 시 닉네임 localStorage 저장
 * 8. preFetchData 중복 호출 방어 플래그 추가
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = [];
var isDataLoaded = false;
var isMapTilesLoaded = false; // [추가] 지도 타일 로드 완료 플래그
var isFetching = false;       // [추가] 중복 fetch 방어 플래그
var boardData = [];
var currentBoardPage = 1;      // [추가] 수다방 현재 페이지
const POSTS_PER_PAGE = 10;     // [추가] 페이지당 게시글 수
var userScores = {};           // [추가 - 단계 4-1] 닉네임 → 점수 맵 (뱃지 표시용)
var currentUserPos = null;     // [신규 2026-04-20] 현재 위치 (가까운 주차 위젯용)
var userLocMarker = null;      // [신규 2026-04-20] 내 위치 자동차 마커 (지도에 라이브 표시)
var userLocWatchId = null;     // [신규 2026-04-20] watchPosition 핸들 ID
var boardSearchTerm = '';      // [신규 2026-04-20] 수다방 검색어 (제목·본문·작성자 필터)
var boardSearchDebounceId = null;

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwI9NgMrVtwemkJv_PasrjtBX_S19zPQr-s7Qb6lIrO35FjzqyHpru8kh_gY45U1u1b/exec";

// [신규 2026-04-20] 주차장 기본 이미지 (인라인 SVG 데이터 URI) — 업로드된 이미지가 없거나 로드 실패 시 대체용
const DEFAULT_PARKING_IMG = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 200'>"
    + "<rect width='400' height='200' fill='#FFD400'/>"
    + "<circle cx='200' cy='95' r='50' fill='#fff' stroke='#000' stroke-width='4'/>"
    + "<text x='200' y='118' text-anchor='middle' font-size='70' font-weight='900' font-family='sans-serif' fill='#000'>P</text>"
    + "<text x='200' y='175' text-anchor='middle' font-size='14' font-family='sans-serif' fill='#333'>거지주차.com</text>"
    + "</svg>"
);

async function preFetchData() {
    // [추가] 중복 호출 방어
    if (isFetching) return;
    isFetching = true;

    console.log("🚀 데이터 병렬 동기화 시작...");

    const splashText = document.querySelector('#loading-screen p');
    if (splashText) splashText.innerText = "주차 정보 수급 중...";

    const t = new Date().getTime();
    const fetchSheet = fetch(`${SCRIPT_URL}?type=sheet&t=${t}`).then(res => res.json());
    const fetchSeoul = fetch(`${SCRIPT_URL}?type=seoul&t=${t}`).then(res => res.json());
    const fetchBoard = fetch(`${SCRIPT_URL}?type=get_board&t=${t}`).then(res => res.json());
    // [추가 - 단계 4-1] 뱃지 표시용 점수 맵도 함께 수급
    const fetchRanking = fetch(`${SCRIPT_URL}?type=get_ranking&t=${t}`).then(res => res.json());

    try {
        const results = await Promise.allSettled([fetchSheet, fetchSeoul, fetchBoard, fetchRanking]);

        results.forEach((result, idx) => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                if (idx === 0 || idx === 1) {
                    preloadedData.push(...result.value);
                } else if (idx === 2) {
                    boardData = result.value;
                } else if (idx === 3) {
                    // [추가] ranking 결과를 userScores 맵으로 변환
                    rankingData = result.value;
                    userScores = {};
                    result.value.forEach(u => { userScores[String(u.user)] = u.score; });
                }
            } else {
                console.warn(`${idx + 1}번 데이터 로드 실패 또는 규격 오류.`, result.reason);
            }
        });

        isDataLoaded = true;
        console.log("🏁 데이터 수급 완료");

        if (splashText) splashText.innerText = "명당 지도 생성 중...";

        if (map) renderAllMarkers();
        if (!document.getElementById('board-page').classList.contains('hidden')) renderBoard();

        // [신규 2026-04-20] 지도 플로팅 위젯 렌더 (데이터 수급 완료 후)
        renderNearbyWidget();
        renderRecentBoardWidget();
        // 광고 위젯은 데이터 무관하게 노출
        const _adEl = document.getElementById('ad-widget');
        if (_adEl) _adEl.classList.remove('hidden');

    } catch (e) {
        console.error("통합 수급 프로세스 치명적 에러:", e);
        isDataLoaded = true; // 에러여도 스플래시는 닫혀야 함
        hideSplashScreen();
    } finally {
        isFetching = false;
    }
}

// [추가] fetchBoard: openBoard에서 데이터 없을 때 호출되는 독립 함수
async function fetchBoard() {
    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
        const data = await res.json();
        if (Array.isArray(data)) {
            boardData = data;
            // [버그수정 2026-04-20] 우측 위젯에서 특정 글을 곧장 열었는데 뒤늦게 도착한 fetchBoard 응답이
            // renderBoard()로 목록을 다시 그려 상세 화면을 덮어버리는 현상 수정.
            // 현재 글 상세(.post-detail)를 보고 있는 중이면 목록 재렌더 스킵.
            const isViewingDetail = !!document.querySelector('#board-content .post-detail');
            if (!isViewingDetail) renderBoard();
            // [신규 2026-04-20] 우측 위젯도 최신 목록으로 갱신
            if (typeof renderRecentBoardWidget === 'function') renderRecentBoardWidget();
        }
    } catch (e) {
        console.error("수다방 데이터 로드 실패:", e);
    }
}

// [신규 - 단계 3] 랭킹 관련 상태·함수
var rankingData = [];

// 포인트 구간별 뱃지
function getBadge(score) {
    if (score >= 1000) return '🏆';
    if (score >= 50) return '⭐';
    return '';
}

// [추가 - 단계 4-1] 닉네임으로 뱃지 가져오기 (userScores 맵 활용)
function getBadgeForUser(nick) {
    if (!nick) return '';
    return getBadge(userScores[String(nick)] || 0);
}

// [추가 - 단계 4-3] 신고 권한 여부 (내 점수 ≥ 500)
function canReport() {
    const myNick = localStorage.getItem('gj-nick') || '';
    if (!myNick) return false;
    return (userScores[String(myNick)] || 0) >= 500;
}

// [추가 - 단계 4-2] 수정 권한 여부 (내 점수 ≥ 200)
function canEdit() {
    const myNick = localStorage.getItem('gj-nick') || '';
    if (!myNick) return false;
    return (userScores[String(myNick)] || 0) >= 200;
}

// [추가 - 단계 4-2] 주차 후기 수정 (본인 + 200점 이상)
async function editSpotComment(targetName, originalUser, currentContent, currentRating) {
    const myNick = localStorage.getItem('gj-nick') || '';
    if (String(myNick) !== String(originalUser)) return alert("본인이 작성한 후기만 수정할 수 있습니다.");
    if (!canEdit()) return alert("수정 권한은 200점 이상 유저에게만 부여됩니다.");

    const newContent = prompt("후기 내용을 수정하세요.", currentContent || "");
    if (newContent === null) return;
    const newRatingStr = prompt("별점을 입력하세요 (1~5)", String(currentRating || 5));
    if (newRatingStr === null) return;
    const newRating = parseInt(newRatingStr, 10);
    if (isNaN(newRating) || newRating < 1 || newRating > 5) return alert("별점은 1~5 사이의 숫자여야 합니다.");

    const pw = prompt(`[${myNick}] 님의 비밀번호를 입력해주세요.`);
    if (!pw) return;

    toggleLoading(true, "후기 수정 중...");
    try {
        const q = new URLSearchParams({ type: "edit_comment", target_id: targetName, user: myNick, pw: pw, comment: newContent, rating: newRating });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("후기가 수정되었습니다.");
            location.reload();
        } else {
            alert("오류: " + (result.msg || "수정 실패"));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [추가 - 단계 4-2] 수다방 댓글 수정 (본인 + 200점 이상)
async function editBoardComment(postId, originalUser, date, currentText) {
    const myNick = localStorage.getItem('gj-nick') || '';
    if (String(myNick) !== String(originalUser)) return alert("본인이 작성한 댓글만 수정할 수 있습니다.");
    if (!canEdit()) return alert("수정 권한은 200점 이상 유저에게만 부여됩니다.");

    const newText = prompt("댓글 내용을 수정하세요.", currentText || "");
    if (newText === null) return;
    if (!newText.trim()) return alert("빈 내용으로는 수정할 수 없습니다.");

    const pw = prompt(`[${myNick}] 님의 비밀번호를 입력해주세요.`);
    if (!pw) return;

    toggleLoading(true, "댓글 수정 중...");
    try {
        const q = new URLSearchParams({ type: "edit_board_comment", post_id: postId, user: myNick, pw: pw, date: date, comment: newText });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("댓글이 수정되었습니다.");
            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();
            viewPostDetail(postId, false);
        } else {
            alert("오류: " + (result.msg || "수정 실패"));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [추가 - 단계 4-3] 수다방 글 신고
async function reportPost(postId, authorNick) {
    const myNick = localStorage.getItem('gj-nick') || '';
    if (!myNick) return alert("신고하려면 먼저 닉네임으로 활동 기록이 있어야 해요.");
    if (String(myNick) === String(authorNick)) return alert("본인이 작성한 글은 신고할 수 없습니다.");
    if (!canReport()) return alert("신고 권한은 500점 이상 유저에게만 부여됩니다.");

    if (!confirm(`이 글을 신고하시겠습니까?\n\n3명 이상 신고가 누적되면 자동 숨김 처리됩니다.\n(2000점 이상 유저는 가중치 2배)`)) return;
    const pw = prompt(`[${myNick}] 님의 비밀번호를 입력해주세요.`);
    if (!pw) return;

    toggleLoading(true, "신고 접수 중...");
    try {
        const q = new URLSearchParams({ type: "report_post", post_id: postId, user: myNick, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert(`신고가 접수되었습니다. (가중치 ${result.weight})`);
            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();
            renderBoard();
        } else {
            alert("오류: " + (result.msg || "신고 실패"));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [추가 - 단계 4-3] 수다방 댓글 신고
async function reportBoardComment(postId, commentUser, commentDate) {
    const myNick = localStorage.getItem('gj-nick') || '';
    if (!myNick) return alert("신고하려면 먼저 닉네임으로 활동 기록이 있어야 해요.");
    if (String(myNick) === String(commentUser)) return alert("본인이 작성한 댓글은 신고할 수 없습니다.");
    if (!canReport()) return alert("신고 권한은 500점 이상 유저에게만 부여됩니다.");

    if (!confirm(`이 댓글을 신고하시겠습니까?\n\n3명 이상 신고가 누적되면 자동 숨김 처리됩니다.`)) return;
    const pw = prompt(`[${myNick}] 님의 비밀번호를 입력해주세요.`);
    if (!pw) return;

    toggleLoading(true, "신고 접수 중...");
    try {
        const q = new URLSearchParams({ type: "report_comment", post_id: postId, comment_user: commentUser, date: commentDate, user: myNick, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert(`신고가 접수되었습니다. (가중치 ${result.weight})`);
            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();
            viewPostDetail(postId, false);
        } else {
            alert("오류: " + (result.msg || "신고 실패"));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [추가 - webp/핫링크 대응] 이미지 로드 실패 시 대체 URL로 재시도
// drive.google.com/thumbnail 실패 → drive.google.com/uc?export=view 재시도 → 그래도 실패하면 플레이스홀더로 교체
function handleImgError(imgEl, originalUrl) {
    if (!imgEl) return;
    if (!imgEl.dataset.retried) {
        imgEl.dataset.retried = '1';
        var idMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(originalUrl || '');
        if (idMatch) {
            imgEl.src = 'https://drive.google.com/uc?export=view&id=' + idMatch[1];
            return;
        }
    }
    // 재시도도 실패 or Drive ID가 없는 외부 URL → 플레이스홀더로 교체
    var placeholder = document.createElement('div');
    placeholder.style.cssText = 'width:100%; padding:40px 15px; background:#f5f5f5; border:1px dashed #ccc; border-radius:10px; text-align:center; color:#999; font-size:13px; margin-bottom:15px;';
    placeholder.innerHTML = '🖼️ 이미지를 불러올 수 없습니다<br><span style="font-size:11px; color:#bbb;">(외부 사이트의 핫링크 차단 등)</span>';
    if (imgEl.parentNode) imgEl.parentNode.replaceChild(placeholder, imgEl);
}

// 다음 혜택 구간 계산
function getNextTier(score) {
    const tiers = [
        { name: '⭐ 뱃지', points: 50 },
        { name: '후기·댓글 수정 권한', points: 200 },
        { name: '수다방 신고 권한', points: 500 },
        { name: '🏆 뱃지 + 후기 정렬 우선권', points: 1000 },
        { name: '신고 가중치 2배', points: 2000 }
    ];
    return tiers.find(t => t.points > score);
}

async function openRanking() {
    const rankingPage = document.getElementById('ranking-page');
    rankingPage.classList.remove('hidden');
    document.getElementById('floating-menu').style.display = 'none';
    // [신규 2026-04-20] 랭킹 페이지 열릴 땐 지도 위젯 가리기
    hideMapWidgets();
    history.pushState({ view: 'ranking' }, "랭킹", "#ranking");

    const content = document.getElementById('ranking-content');
    content.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:#999;">
            <div class="loader" style="margin:0 auto 15px;"></div>
            랭킹 집계 중...
        </div>`;

    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_ranking&t=${new Date().getTime()}`);
        const data = await res.json();
        if (Array.isArray(data)) {
            rankingData = data;
            renderRanking();
        } else {
            content.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">랭킹을 불러올 수 없습니다.</div>`;
        }
    } catch (e) {
        content.innerHTML = `<div style="text-align:center; padding:40px; color:#ff4d4d;">통신 오류가 발생했습니다.</div>`;
    }
}

function renderRanking() {
    const content = document.getElementById('ranking-content');
    const myNick = localStorage.getItem('gj-nick') || '';

    if (rankingData.length === 0) {
        content.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">아직 랭킹 데이터가 없어요.<br>첫 제보를 남겨보세요! 🙌</div>`;
        return;
    }

    const topN = rankingData.slice(0, 10);
    const myStat = rankingData.find(u => String(u.user) === String(myNick));

    const topHtml = topN.map(u => {
        const badge = getBadge(u.score);
        const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : `#${u.rank}`;
        const isMe = myNick && String(u.user) === String(myNick);
        return `
        <div class="rank-row ${isMe ? 'me' : ''}">
            <div class="rank-num">${medal}</div>
            <div class="rank-main">
                <div class="rank-user">${u.user} ${badge}</div>
                <div class="rank-detail">제보 ${u.reportCount} · 평균 ${u.avgRating}★</div>
            </div>
            <div class="rank-score">${u.score}점</div>
        </div>`;
    }).join('');

    let myHtml = '';
    if (myStat) {
        const nextTier = getNextTier(myStat.score);
        const nextHtml = nextTier
            ? `<div class="next-tier">다음 혜택 <b>${nextTier.name}</b>까지 <b>${nextTier.points - myStat.score}점</b> 남음</div>`
            : `<div class="next-tier">🎉 최고 등급 달성!</div>`;
        myHtml = `
        <div class="my-rank-box">
            <h3>내 순위</h3>
            <div class="rank-row me">
                <div class="rank-num">#${myStat.rank}</div>
                <div class="rank-main">
                    <div class="rank-user">${myStat.user} ${getBadge(myStat.score)}</div>
                    <div class="rank-detail">제보 ${myStat.reportCount} · 평균 ${myStat.avgRating}★</div>
                </div>
                <div class="rank-score">${myStat.score}점</div>
            </div>
            ${nextHtml}
        </div>`;
    } else if (myNick) {
        myHtml = `<div class="my-rank-box"><p style="color:#999; text-align:center; margin:0;">[${myNick}]님은 아직 제보 기록이 없어 랭킹에 포함되지 않아요.</p></div>`;
    }

    const formulaHtml = `
        <div class="rank-formula">
            <b>점수 공식</b><br>
            제보 1건당 +5점 · 내 제보에 받은 별점 합계 (1★=1점, 5★=5점)<br>
            <span style="color:#999;">※ 본인이 본인 제보에 남긴 후기는 점수에 포함되지 않아요.</span>
        </div>`;

    content.innerHTML = `
        <div class="rank-top-section">
            <h3>TOP 10</h3>
            ${topHtml}
        </div>
        ${myHtml}
        ${formulaHtml}
    `;
}

function closeRanking() {
    document.getElementById('ranking-page').classList.add('hidden');
    document.getElementById('floating-menu').style.display = 'flex';
    // [신규 2026-04-20] 지도 위젯 복귀
    showMapWidgets();
    if (window.location.hash === '#ranking') history.replaceState(null, "", window.location.pathname);
}

// 2. 지도 및 마커 렌더링
function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);
    navigator.geolocation.getCurrentPosition((pos) => {
        // [신규 2026-04-20] 현재 위치 저장 — 가까운 주차 위젯 계산용
        currentUserPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setupMap(pos.coords.latitude, pos.coords.longitude);
        renderNearbyWidget();
        // [신규 2026-04-20] 내 위치 자동차 마커 + 라이브 추적 시작
        updateUserLocMarker(pos.coords.latitude, pos.coords.longitude);
        startUserLocWatch();
    }, () => { setupMap(37.5665, 126.9780); }, { timeout: 3000 });
}

// [신규 2026-04-20] 두 좌표간 거리 (km) — Haversine 공식
function haversineDistance(lat1, lng1, lat2, lng2) {
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return NaN;
    const R = 6371; // 지구 반경 km
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
    if (isNaN(km)) return '';
    if (km < 1) return Math.round(km * 1000) + 'm';
    if (km < 10) return km.toFixed(1) + 'km';
    return Math.round(km) + 'km';
}

// [신규 2026-04-20] 좌측 위젯: 현재 위치 기준 가까운 주차 5곳
function renderNearbyWidget() {
    const widget = document.getElementById('nearby-widget');
    const list = document.getElementById('nearby-list');
    if (!widget || !list) return;

    if (!currentUserPos) {
        list.innerHTML = `<div class="widget-empty">위치 권한이 필요해요</div>`;
        widget.classList.remove('hidden');
        return;
    }
    if (!preloadedData || preloadedData.length === 0) {
        list.innerHTML = `<div class="widget-empty">주차 정보 로드 중...</div>`;
        widget.classList.remove('hidden');
        return;
    }

    const withDistance = preloadedData
        .map(it => ({
            it: it,
            d: haversineDistance(currentUserPos.lat, currentUserPos.lng, it.lat, it.lng)
        }))
        .filter(x => !isNaN(x.d))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);

    if (withDistance.length === 0) {
        list.innerHTML = `<div class="widget-empty">주변에 주차 정보가 없어요</div>`;
    } else {
        list.innerHTML = withDistance.map(({ it, d }) => {
            const nameEsc = String(it.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
            <div class="widget-item" onclick="panToSpot(${it.lat}, ${it.lng}, '${nameEsc}')">
                <div class="widget-item-title">${it.name || '이름 없음'}</div>
                <div class="widget-item-meta">${it.type || ''} · ${formatDistance(d)}</div>
            </div>`;
        }).join('');
    }
    widget.classList.remove('hidden');
}

function panToSpot(lat, lng, name) {
    if (!map) return;
    map.panTo(new naver.maps.LatLng(lat, lng));
    map.setZoom(17);
}

// [신규 2026-04-20] 우측 위젯: 최근 수다방 글 5개 (클릭 시 해당 글로 이동)
function renderRecentBoardWidget() {
    const widget = document.getElementById('recent-board-widget');
    const list = document.getElementById('recent-board-list');
    if (!widget || !list) return;

    if (!boardData || boardData.length === 0) {
        list.innerHTML = `<div class="widget-empty">아직 글이 없어요</div>`;
        widget.classList.remove('hidden');
        return;
    }

    const recent = boardData.slice(0, 5);
    list.innerHTML = recent.map(p => {
        const pidEsc = String(p.id || '').replace(/'/g, "\\'");
        const title = String(p.title || '(제목 없음)');
        const badge = getBadgeForUser(p.author);
        return `
        <div class="widget-item" onclick="openBoardAtPost('${pidEsc}')">
            <div class="widget-item-title">${title}</div>
            <div class="widget-item-meta">${p.author || '익명'}${badge ? ' ' + badge : ''}</div>
        </div>`;
    }).join('');
    widget.classList.remove('hidden');
}

// [신규 2026-04-20] 우측 위젯에서 글 클릭 → 수다방 열고 해당 글 상세로 이동
function openBoardAtPost(postId) {
    const boardPage = document.getElementById('board-page');
    if (!boardPage) return;
    boardPage.classList.remove('hidden');
    document.getElementById('floating-menu').style.display = 'none';
    hideMapWidgets();
    // 히스토리에 board 상태를 먼저 쌓고, 그 위에 post 상태를 viewPostDetail이 push하도록 함
    history.pushState({ view: 'board' }, "수다방", "#board");
    // 상세를 즉시 렌더 (setTimeout 제거 — 화면 깜빡임 방지)
    viewPostDetail(postId, true);
    // 백그라운드로 최신화 — 상세 화면 덮지 않도록 fetchBoard 내부에서 체크
    fetchBoard();
}

// [신규 2026-04-20] 위젯 접기/펴기 토글
function toggleWidget(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

// [신규 2026-04-20] 지도 위젯 보이기/숨기기 (수다방·랭킹 페이지 이동 시)
function hideMapWidgets() {
    ['nearby-widget', 'recent-board-widget', 'ad-widget'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}
function showMapWidgets() {
    // 데이터가 준비됐을 때만 다시 노출
    if (currentUserPos || (preloadedData && preloadedData.length > 0)) renderNearbyWidget();
    if (boardData && boardData.length > 0) renderRecentBoardWidget();
    // 광고 위젯은 항상 노출 (데이터 의존 없음)
    const adEl = document.getElementById('ad-widget');
    if (adEl) adEl.classList.remove('hidden');
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', { center: new naver.maps.LatLng(lat, lng), zoom: 15 });
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        isMapTilesLoaded = true; // [추가] 타일 로드 완료 플래그 설정
        hideSplashScreen();
    });
    setupEvents();
}

// [수정] Race Condition 해결: 데이터 로드 AND 타일 로드 양쪽 모두 완료되어야만 닫힘
function hideSplashScreen() {
    if (!isDataLoaded || !isMapTilesLoaded) return; // 둘 다 준비됐을 때만 닫기
    const screen = document.getElementById('loading-screen');
    if (screen && screen.style.display !== 'none') {
        screen.style.opacity = '0';
        setTimeout(() => {
            screen.style.display = 'none';
            console.log("✨ 모든 준비 완료. 지도 공개");
            // [신규 2026-04-20] 스플래시가 닫힌 뒤 공지 모달 노출 (하루 1회)
            maybeShowNotice();
            // [신규 2026-04-20] 방문자 카운터 초기화 (세션당 1회 +1)
            initVisitorCounter();
        }, 500);
    }
}

// [신규 2026-04-20] 방문자 수 위젯 — 세션당 1회만 +1, 총 누적 표시
function initVisitorCounter() {
    const widget = document.getElementById('visitor-counter');
    const numEl = document.getElementById('visitor-counter-num');
    if (!widget || !numEl) return;
    widget.classList.remove('hidden');

    // 세션당 1회 증가: sessionStorage 플래그로 중복 방지 (새 탭/새 세션에만 +1)
    let alreadyIncreased = false;
    try { alreadyIncreased = sessionStorage.getItem('gj-visited') === '1'; } catch (e) {}
    const incParam = alreadyIncreased ? '' : '&inc=1';

    fetch(`${SCRIPT_URL}?type=visitor_count${incParam}`)
        .then(r => r.json())
        .then(data => {
            if (data && typeof data.total === 'number') {
                numEl.textContent = data.total.toLocaleString('ko-KR');
                if (!alreadyIncreased) {
                    try { sessionStorage.setItem('gj-visited', '1'); } catch (e) {}
                }
            }
        })
        .catch(() => { numEl.textContent = '–'; });
}

// [리뉴얼 2026-04-20] 마커 콘텐츠 빌더 — 역물방울 핀 / 고슴도치 단속 마커
function buildMarkerContent(item) {
    if (item.crackdownActive) {
        return `<div class="gj-crackdown-marker gj-marker-drop" title="주차 주의 — 30분 내 신고됨">
            <div class="gj-spiky-bg"></div>
            <div class="gj-spiky-text">
                <span class="siren">⚠️</span>
                <span class="danso">주의</span>
            </div>
        </div>`;
    }
    // 일반 마커: 역물방울 SVG + 유형 라벨 (pill)
    const typeText = String(item.type || '무료').replace(/</g, '&lt;');
    return `<div class="gj-pin-marker gj-marker-drop">
        <svg class="gj-pin-svg" viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
            <path d="M16 2 C7.2 2 2 8 2 17 C2 28 16 40 16 40 C16 40 30 28 30 17 C30 8 24.8 2 16 2 Z"
                  fill="#1c2633" stroke="#FFD400" stroke-width="3" stroke-linejoin="round"/>
            <circle cx="16" cy="16" r="7" fill="#FFD400"/>
            <text x="16" y="20" text-anchor="middle" font-size="11" font-weight="900" fill="#1c2633" font-family="sans-serif">P</text>
        </svg>
        <div class="gj-pin-label">${typeText}</div>
    </div>`;
}

function renderAllMarkers() {
    if (!map) return;
    preloadedData.forEach(item => {
        if (!item.isRendered) {
            // 앵커: 단속 마커는 중앙 하단(31, 62), 일반 핀은 점 끝(16, 42)
            const anchor = item.crackdownActive
                ? new naver.maps.Point(31, 62)
                : new naver.maps.Point(16, 42);
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(item.lat, item.lng),
                map: map,
                icon: { content: buildMarkerContent(item), anchor: anchor }
            });
            attachInfoWindow(marker, item);
            item.isRendered = true;
        }
    });
    hideSplashScreen();
}

function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    const savedNick = localStorage.getItem('gj-nick') || '';
    // [추가] onclick 인자에 안전하게 박기 위한 이스케이프
    const nameEsc = String(item.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // [추가 - 단계 4-4] 후기 정렬 우선권: 점수 높은 유저(🏆·⭐)의 후기가 먼저 보이도록
    const sortedComments = (item.comments || []).slice().sort((a, b) => {
        return (userScores[String(b.user)] || 0) - (userScores[String(a.user)] || 0);
    });

    const myNickForEdit = localStorage.getItem('gj-nick') || '';
    let commentsHtml = sortedComments.length > 0 ? sortedComments.map(c => {
        const userEsc = String(c.user).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        // [추가 - 단계 4-1] 후기 작성자 뱃지
        const badge = getBadgeForUser(c.user);
        // [추가 - 단계 4-2] 본인 + 200점 이상이면 수정 버튼 노출
        const showEdit = canEdit() && String(myNickForEdit) === String(c.user);
        const commentEsc = String(c.comment || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
        const editBtn = showEdit
            ? `<span onclick="editSpotComment('${nameEsc}', '${userEsc}', '${commentEsc}', ${c.rating || 5})" style="font-size:10px; color:#2196f3; cursor:pointer; text-decoration:underline; margin-right:6px;">수정</span>`
            : '';
        return `
        <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:11px; font-weight:bold; color:#555;">${c.user}${badge ? ' ' + badge : ''} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
                <div>
                    ${editBtn}
                    <span onclick="deleteSpotComment('${nameEsc}', '${userEsc}')" style="font-size:10px; color:#bbb; cursor:pointer; text-decoration:underline;">삭제</span>
                </div>
            </div>
            <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
        </div>`;
    }).join('') : "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";

    // [신규 2026-04-20] 주차 이미지 — 서버가 준 imageUrl, 없으면 기본 P 이미지. 로드 실패 시 기본 이미지로 폴백.
    const imgSrc = item.imageUrl || DEFAULT_PARKING_IMG;
    const defaultImgAttr = DEFAULT_PARKING_IMG.replace(/"/g, '&quot;');
    const imageHtml = `
        <div style="width:100%; margin-bottom:10px;">
            <img src="${imgSrc}" referrerpolicy="no-referrer"
                 onerror="this.onerror=null; this.src='${defaultImgAttr}';"
                 style="width:100%; height:110px; object-fit:cover; border-radius:10px; border:1px solid #eee; display:block;">
        </div>`;

    // [신규 2026-04-20] 단속 떴다 배지 — 30분 내 신고된 장소에만 노출
    const crackdownMinLeft = item.crackdownActive && item.crackdownAt
        ? Math.max(0, 30 - Math.floor((Date.now() - new Date(item.crackdownAt).getTime()) / 60000))
        : 0;
    const crackdownBadge = item.crackdownActive
        ? `<span class="crackdown-badge" title="30분 내 주의 신고됨 · ${crackdownMinLeft}분 남음">
             <span class="crackdown-q">!</span> 주차 주의
           </span>`
        : '';

    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap" style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:10px;">
                <b style="font-size:18px; flex:1; min-width:0;">${item.name}</b>
                ${crackdownBadge}
                <span style="color:#f39c12; font-weight:bold; font-size:14px; white-space:nowrap;">⭐ ${item.avgRating || '0.0'}</span>
            </div>

            ${imageHtml}

            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}${getBadgeForUser(item.user) ? ' ' + getBadgeForUser(item.user) : ''}</span></div>
                <!-- [신규 2026-04-20] 주소 표시: 기존엔 address 필드를 쓰지 않아 UI에서 누락됨 -->
                <div class="info-full" style="background:#fffbe6; padding:8px; border-radius:10px; margin:3px 0;">
                    <span class="info-label">주소</span><br>
                    <span class="info-value" style="font-size:12px; word-break:break-all;">${item.address || "주소 정보 없음"}</span>
                </div>
                <div class="info-full" style="background:#f9f9f9; padding:8px; border-radius:10px; margin:5px 0;">
                    <span class="info-label">상세내용</span><br>
                    <span class="info-value" style="white-space:pre-wrap; font-size:12px;">${item.desc || "상세내용 없음"}</span>
                </div>
            </div>

            <div class="comment-list" style="max-height:100px; overflow-y:auto; border-top:1px solid #FFD400; margin:10px 0;">
                ${commentsHtml}
            </div>

            <div class="feedback-section" style="border-top:1px dashed #ddd; padding-top:10px;">
                <div class="star-rating" id="star-wrap-${idSafe}" style="display:flex; justify-content:center; gap:5px; margin-bottom:5px;">
                    ${[1,2,3,4,5].map(n => `<span class="star-btn" style="cursor:pointer; font-size:18px; color:#ddd;" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <!-- [수정] 닉/비번 칸을 균일(flex:1 1 0)하게 맞추고, min-width:0으로 input 기본 최소폭 해제 → 정보창 내부로 쏙 들어오게 -->
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="text" id="cmt-nick-${idSafe}" value="${savedNick}" placeholder="닉네임" style="flex:1 1 0; min-width:0; width:0; padding:8px; font-size:12px; border:1px solid #eee; border-radius:10px; box-sizing:border-box;">
                    <input type="password" id="cmt-pw-${idSafe}" placeholder="비번" style="flex:1 1 0; min-width:0; width:0; padding:8px; font-size:12px; border:1px solid #eee; border-radius:10px; box-sizing:border-box;">
                </div>
                <div style="display:flex; gap:5px;">
                    <input type="text" id="cmt-msg-${idSafe}" placeholder="후기 입력 (아이디당 1개)" style="flex:1 1 0; min-width:0; width:0; padding:8px; font-size:12px; border:1px solid #eee; border-radius:10px; box-sizing:border-box;">
                    <button onclick="sendFeedback('${nameEsc}')" style="flex:0 0 auto; background:#FFD400; border:none; border-radius:10px; padding:0 10px; font-weight:bold; font-size:11px;">등록</button>
                </div>
            </div>

            <!-- [신규 2026-04-20] 주차 주의 등록 버튼 — 후기와 별개. 누르면 닉/비번 입력 후 30분간 경고 배지 노출 -->
            <button onclick="submitCrackdown('${nameEsc}')" class="crackdown-btn">⚠️ 주차 주의 등록</button>

            <!-- [신규 2026-04-20] 광고 영역 — 애드센스 투입 전 환영 문구 -->
            <div class="infowindow-ad">
                <div class="infowindow-ad-title">거지주차에 오신 것을 환영합니다</div>
                <div class="infowindow-ad-sub">오늘도 안전운전, 짠내운전 🚗💨</div>
            </div>

            <div style="text-align: right; margin-top: 10px; border-top:1px solid #eee; padding-top:5px;">
                <span onclick="deleteReport('${nameEsc}', ${item.lat}, ${item.lng})" style="font-size:10px; color:#999; cursor:pointer; text-decoration:underline;">제보 삭제 요청</span>
            </div>
        </div>`;

    const info = new naver.maps.InfoWindow({ content: contentHtml, borderWidth: 0, backgroundColor: "transparent", disableAnchor: true });
    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        info.open(map, marker);
        currentInfo = info;
        setTimeout(() => setRatingUI(idSafe, 5), 100);
    });
}

function setRatingUI(id, score) {
    const stars = document.querySelectorAll(`#star-wrap-${id} .star-btn`);
    const input = document.getElementById(`rate-val-${id}`);
    if (input) input.value = score;

    stars.forEach((s, i) => {
        s.style.color = i < score ? "#FFD400" : "#ddd";
    });
}

async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    // [수정] 닉네임 + 비번을 폼에서 직접 읽도록 변경 (아이디당 1개 규칙 + 무결성)
    const nick = document.getElementById(`cmt-nick-${idSafe}`).value.trim();
    const pw = document.getElementById(`cmt-pw-${idSafe}`).value;
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;

    if (!nick) return alert("닉네임을 입력해주세요!");
    if (!pw) return alert("비밀번호를 입력해주세요!");
    if (!msg) return alert("내용을 입력해주세요!");

    toggleLoading(true, "후기 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_comment", target_id: targetName, user: nick, pw: pw, comment: msg, rating: rate });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();

        if (result.res === "ok") {
            localStorage.setItem('gj-nick', nick);
            alert(result.updated ? "기존 후기가 갱신되었습니다!" : "후기가 등록되었습니다!");
            location.reload();
        } else {
            alert("오류: " + (result.msg || "등록에 실패했습니다."));
        }
    } catch (e) {
        alert("등록 중 통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [수정 2026-04-20] 주차 주의 등록 — 별점/후기와 별개로 30분간 경고 노출, 랭킹엔 +2.5점
// (내부 API 이름 add_crackdown은 유지, UI 문구만 '단속' → '주차 주의'로 순화)
async function submitCrackdown(targetName) {
    const savedNick = localStorage.getItem('gj-nick') || '';
    const nick = prompt("닉네임을 입력하세요.", savedNick);
    if (!nick) return;
    const pw = prompt(`[${nick}] 님의 비밀번호를 입력하세요.\n\n(후기 등록 시 쓰던 비번과 동일해야 해요)`);
    if (!pw) return;

    if (!confirm(`"${targetName}"에 "주차 주의"를 등록할까요?\n\n30분간 다른 사용자에게 ⚠️ 경고 배지가 표시됩니다.\n허위 등록은 제재 대상이 될 수 있어요.`)) return;

    toggleLoading(true, "주차 주의 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_crackdown", target_id: targetName, user: nick, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            localStorage.setItem('gj-nick', nick);
            alert("⚠️ 주차 주의가 접수되었습니다. 30분간 다른 사용자에게 경고 배지가 표시돼요.\n(랭킹 +2.5점)");
            location.reload();
        } else {
            alert("오류: " + (result.msg || "등록 실패"));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// =================================================
// [신규 2026-04-20] 수다방 조회수 / 추천 (좋아요)
// =================================================
// 내가 이 세션에서 이미 조회수 올린 글 (중복 호출 방지)
var _viewIncrementedThisSession = {};
function incrementPostView(postId) {
    const key = String(postId);
    if (_viewIncrementedThisSession[key]) return;
    _viewIncrementedThisSession[key] = true;
    // fire-and-forget — 실패해도 사용자 경험에 영향 없음
    fetch(`${SCRIPT_URL}?type=increment_view&post_id=${encodeURIComponent(key)}&t=${Date.now()}`)
        .then(r => r.json())
        .then(r => {
            if (r && r.viewCount) {
                const post = boardData.find(p => String(p.id) === key);
                if (post) post.viewCount = r.viewCount;
            }
        })
        .catch(() => {});
}

// 로컬 캐시 기반 "내가 추천한 글 ID 목록" (per-device)
function getLikedPostsCache() {
    try {
        const raw = localStorage.getItem('gj-liked-posts');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function isPostLikedByMe(postId) {
    return getLikedPostsCache().indexOf(String(postId)) !== -1;
}
function addLikedPostToCache(postId) {
    const arr = getLikedPostsCache();
    const key = String(postId);
    if (arr.indexOf(key) === -1) {
        arr.push(key);
        try { localStorage.setItem('gj-liked-posts', JSON.stringify(arr)); } catch (e) {}
    }
}
async function submitLike(postId) {
    if (isPostLikedByMe(postId)) {
        alert("이미 추천하셨어요!");
        return;
    }
    const savedNick = localStorage.getItem('gj-nick') || '';
    const nick = prompt("닉네임을 입력하세요.", savedNick);
    if (!nick) return;
    const pw = prompt(`[${nick}] 님의 비밀번호를 입력하세요.`);
    if (!pw) return;

    toggleLoading(true, "추천 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_like", post_id: postId, user: nick, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            localStorage.setItem('gj-nick', nick);
            addLikedPostToCache(postId);
            const post = boardData.find(p => String(p.id) === String(postId));
            if (post) post.likeCount = result.likeCount || ((parseInt(post.likeCount) || 0) + 1);
            alert("👍 추천 감사합니다!");
            if (document.querySelector('#board-content .post-detail')) {
                viewPostDetail(postId, false);
            } else {
                renderBoard();
            }
        } else {
            if (result.msg && result.msg.indexOf("이미") !== -1) addLikedPostToCache(postId);
            alert("오류: " + (result.msg || "추천 실패"));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [신규] 주차 후기 삭제: 본인 비번 입력 시 삭제
async function deleteSpotComment(targetName, originalUser) {
    const pw = prompt(`[${originalUser}] 님이 작성한 후기를 삭제하려면 비밀번호를 입력하세요.`);
    if (!pw) return;

    toggleLoading(true, "후기 삭제 중...");
    try {
        const q = new URLSearchParams({ type: "delete_comment", target_id: targetName, user: originalUser, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("후기가 삭제되었습니다.");
            location.reload();
        } else {
            alert("오류: " + (result.msg || "삭제에 실패했습니다."));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

function openBoard() {
    const boardPage = document.getElementById('board-page');
    boardPage.classList.remove('hidden');
    document.getElementById('floating-menu').style.display = 'none';
    // [신규 2026-04-20] 수다방 열릴 땐 지도 위젯 가리기
    hideMapWidgets();

    history.pushState({ view: 'board' }, "수다방", "#board");

    currentBoardPage = 1; // [추가] 수다방 진입 시 1페이지로 초기화

    // [버그 수정 2026-04-19] 진입 시마다 항상 서버에서 최신 목록 재수급.
    // 기존엔 boardData가 비어있지 않으면 캐시만 그리고 끝내서 "새로고침해야 새 글이 보이는" 현상 발생.
    if (boardData.length > 0) {
        renderBoard(); // 1) 캐시된 목록으로 즉시 그려서 체감 속도 유지
    } else {
        renderBoard(); // 빈 상태 메시지 노출
    }
    fetchBoard(); // 2) 항상 최신본 재요청 → 성공 시 renderBoard() 호출
}

function closeBoard() {
    document.getElementById('board-page').classList.add('hidden');
    document.getElementById('floating-menu').style.display = 'flex';
    // [신규 2026-04-20] 수다방 닫을 때 검색어 초기화 (다음 진입 시 깨끗한 상태)
    boardSearchTerm = '';
    // [신규 2026-04-20] 지도 위젯 복귀
    showMapWidgets();
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
}

function renderBoard() {
    const content = document.getElementById('board-content');
    document.getElementById('write-btn').style.display = 'block';

    // [신규 2026-04-20] 검색 바 — 항상 상단에 고정 노출. 입력 커서 복원 위해 innerHTML 재구성 후 focus 복구.
    const safeTerm = String(boardSearchTerm || '').replace(/"/g, '&quot;');
    const searchBarHtml = `
        <div class="board-search">
            <input type="text" id="board-search-input" placeholder="🔍 제목·본문·작성자 검색" value="${safeTerm}" oninput="onBoardSearch(this.value)">
            ${boardSearchTerm ? `<button class="board-search-clear" onclick="clearBoardSearch()" title="검색 지우기">×</button>` : ''}
        </div>`;

    // 검색어 기반 필터링 (없으면 전체)
    let filtered = boardData;
    if (boardSearchTerm) {
        const q = boardSearchTerm.toLowerCase();
        filtered = boardData.filter(p =>
            String(p.title || '').toLowerCase().includes(q)
            || String(p.content || '').toLowerCase().includes(q)
            || String(p.author || '').toLowerCase().includes(q)
        );
    }

    if (boardData.length === 0) {
        content.innerHTML = searchBarHtml + `<div style="text-align:center; color:#999; padding:40px; font-size:14px;">아직 수다가 없어요. 첫 글을 남겨보세요! 🙌</div>`;
        restoreBoardSearchFocus();
        return;
    }
    if (filtered.length === 0) {
        content.innerHTML = searchBarHtml + `<div style="text-align:center; color:#999; padding:40px; font-size:14px;">"${boardSearchTerm}"에 해당하는 글이 없어요.</div>`;
        restoreBoardSearchFocus();
        return;
    }

    // [추가] 페이지네이션 계산 (필터 후 기준)
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    if (currentBoardPage > totalPages) currentBoardPage = totalPages;
    if (currentBoardPage < 1) currentBoardPage = 1;

    const startIdx = (currentBoardPage - 1) * POSTS_PER_PAGE;
    const endIdx = startIdx + POSTS_PER_PAGE;
    const pageData = filtered.slice(startIdx, endIdx);

    const postListHtml = pageData.map(p => {
        const pidEsc = String(p.id).replace(/'/g, "\\'");
        // [추가 - 단계 4-1] 작성자 뱃지
        const badge = getBadgeForUser(p.author);
        // [신규 2026-04-20] 조회수·추천수 배지
        const vc = parseInt(p.viewCount) || 0;
        const lc = parseInt(p.likeCount) || 0;
        const likedByMe = isPostLikedByMe(p.id);
        const statsHtml = `<span class="post-stats"><span class="stat-views">${vc}</span><span class="stat-likes${likedByMe ? ' liked' : ''}">${lc}</span></span>`;
        return `
        <div class="post-card" onclick="viewPostDetail('${pidEsc}')">
            <div style="font-size:12px; color:#999;">${p.author}${badge ? ' ' + badge : ''}${statsHtml}</div>
            <h3 style="margin:5px 0;">${p.title}</h3>
        </div>`;
    }).join('');

    const paginationHtml = renderPagination(currentBoardPage, totalPages);

    content.innerHTML = searchBarHtml + `<div id="post-list">${postListHtml}</div>${paginationHtml}`;
    restoreBoardSearchFocus();
}

// [신규 2026-04-20] 검색 입력 핸들러 — 250ms 디바운스로 타이핑 중 과도한 리렌더 방지
function onBoardSearch(v) {
    boardSearchTerm = v;
    _boardSearchWasFocused = true; // 리렌더 후 포커스 복원
    clearTimeout(boardSearchDebounceId);
    boardSearchDebounceId = setTimeout(() => {
        currentBoardPage = 1;
        renderBoard();
    }, 250);
}

function clearBoardSearch() {
    boardSearchTerm = '';
    currentBoardPage = 1;
    renderBoard();
}

// innerHTML 재구성 후 focus 복원 — 사용자가 검색 중일 때만 복원 (초기 진입 시엔 포커스 주지 않음)
var _boardSearchWasFocused = false;
function restoreBoardSearchFocus() {
    const input = document.getElementById('board-search-input');
    if (!input) return;
    if (_boardSearchWasFocused) {
        input.focus();
        const len = input.value.length;
        try { input.setSelectionRange(len, len); } catch (e) {}
        _boardSearchWasFocused = false;
    }
}

// [신규] 페이지 번호 UI 생성 (현재 페이지 기준 앞뒤 2개씩 + 처음/끝)
function renderPagination(current, total) {
    if (total <= 1) return '';
    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    start = Math.max(1, end - 4);

    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="goToBoardPage(${current - 1})">‹</button>`;
    if (start > 1) {
        html += `<button class="page-btn" onclick="goToBoardPage(1)">1</button>`;
        if (start > 2) html += `<span class="page-ellipsis">…</span>`;
    }
    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToBoardPage(${i})">${i}</button>`;
    }
    if (end < total) {
        if (end < total - 1) html += `<span class="page-ellipsis">…</span>`;
        html += `<button class="page-btn" onclick="goToBoardPage(${total})">${total}</button>`;
    }
    html += `<button class="page-btn" ${current === total ? 'disabled' : ''} onclick="goToBoardPage(${current + 1})">›</button>`;
    html += '</div>';
    return html;
}

// [신규] 페이지 이동
function goToBoardPage(page) {
    currentBoardPage = page;
    renderBoard();
    const boardPage = document.getElementById('board-page');
    if (boardPage) boardPage.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWriteForm() {
    const content = document.getElementById('board-content');
    const nick = localStorage.getItem('gj-nick') || "";
    content.innerHTML = `
        <div class="write-form">
            <button onclick="renderBoard()" class="back-btn">← 목록</button>
            <h4 style="margin:15px 0;">수다 남기기 ✍️</h4>
            <input type="text" id="b-title" placeholder="제목" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box;">
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" id="b-nick" value="${nick}" placeholder="닉네임" style="flex:1; padding:10px;">
                <input type="password" id="b-pw" placeholder="비번" style="flex:1; padding:10px;">
            </div>
            <textarea id="b-content" placeholder="내용" style="width:100%; height:150px; padding:10px; box-sizing:border-box;"></textarea>
            <input type="file" id="b-file" accept="image/*" style="width:100%; margin:15px 0;">
            <!-- [신규 2026-04-19] 외부 이미지 URL (ruliweb 등 핫링크 차단 우회용 — 서버가 Drive로 복사) -->
            <input type="text" id="b-img-url" placeholder="또는 이미지 URL 붙여넣기 (선택)" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box;">
            <div style="font-size:11px; color:#888; margin-bottom:10px;">※ 파일 업로드가 있으면 URL은 무시됩니다. 외부 URL은 서버에서 받아 Drive로 자동 복사돼요.</div>
            <button onclick="submitPost()" class="btn-save" style="width:100%; padding:15px;">등록하기</button>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
}

function viewPostDetail(postId, isPush = true) {
    const post = boardData.find(p => String(p.id) === String(postId));
    if (!post) return;

    if (isPush) {
        history.pushState({ view: 'post', id: postId }, "글상세", "#post" + postId);
    }

    // [신규 2026-04-20] 조회수 +1 (fire-and-forget, 중복 호출은 서버에서 허용 — 세션 중 1회만 증가하도록 프론트에서 방어)
    incrementPostView(postId);

    const nick = localStorage.getItem('gj-nick') || "";
    // [추가 - 단계 4-3] 글 신고 버튼 노출 조건
    const showReportPost = canReport() && String(nick) !== String(post.author);
    const pidEscTop = String(post.id).replace(/'/g, "\\'");
    const authorEscTop = String(post.author).replace(/'/g, "\\'");
    const reportPostBtn = showReportPost
        ? `<button onclick="reportPost('${pidEscTop}', '${authorEscTop}')" style="color:#ff9800; border:none; background:none; text-decoration:underline; cursor:pointer; margin-right:8px;">🚨 글 신고</button>`
        : '';

    // [신규 2026-04-20] 조회수·추천수 + 추천 버튼
    const vcDetail = parseInt(post.viewCount) || 0;
    const lcDetail = parseInt(post.likeCount) || 0;
    const likedByMe = isPostLikedByMe(post.id);
    const likeBtnHtml = `
        <button class="like-btn${likedByMe ? ' liked' : ''}" onclick="submitLike('${pidEscTop}')" ${likedByMe ? 'disabled' : ''}>
            👍 추천 <span class="like-count">${lcDetail}</span>
        </button>`;
    const detailStatsHtml = `
        <div style="font-size:12px; color:#888; margin-bottom:10px;">
            👀 조회 ${vcDetail} · 👍 추천 ${lcDetail}
        </div>`;

    document.getElementById('board-content').innerHTML = `
        <div class="post-detail">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <button onclick="renderBoardWithHistory()" class="back-btn">← 목록</button>
                <div>
                    ${reportPostBtn}
                    <button onclick="deletePost('${post.id}')" style="color:#ff4d4d; border:none; background:none; text-decoration:underline; cursor:pointer;">글 삭제</button>
                </div>
            </div>
            <h2>${post.title}</h2>
            <div style="font-size:12px; color:#999; margin-bottom:6px;">작성자: ${post.author}${getBadgeForUser(post.author) ? ' ' + getBadgeForUser(post.author) : ''} | ${new Date(post.date).toLocaleString()}</div>
            ${detailStatsHtml}
            ${post.imageUrl ? `<img src="${post.imageUrl}" referrerpolicy="no-referrer" onerror="handleImgError(this, '${post.imageUrl}')" style="width:100%; max-width:100%; border-radius:10px; margin-bottom:15px;">` : ""}
            <!-- [수정 2026-04-20] 원문 링크가 길면 컨테이너 넘쳐서 가로 스크롤 생겼음. word-break + overflow-wrap으로 줄바꿈 강제 -->
            <p style="white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere; margin-bottom:20px;">${post.content}</p>

            <div style="text-align:center; border-top:1px dashed #eee; border-bottom:1px dashed #eee; padding:12px 0; margin-bottom:20px;">
                ${likeBtnHtml}
            </div>

            <div class="detail-comments" style="border-top:2px solid #FFD400; padding-top:20px;">
                <h5>댓글 (${post.comments ? post.comments.length : 0})</h5>
                <div id="b-comment-list" style="margin-bottom:20px;">
                    ${post.comments && post.comments.length > 0 ? post.comments.map(c => {
                        const userEsc = String(c.user).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        const dateEsc = String(c.date || '').replace(/'/g, "\\'");
                        const pidEsc = String(post.id).replace(/'/g, "\\'");
                        // [추가 - 단계 4-1] 댓글 작성자 뱃지
                        const cBadge = getBadgeForUser(c.user);
                        // [추가 - 단계 4-3] 댓글 신고 버튼 노출 조건
                        const showReportCmt = canReport() && String(nick) !== String(c.user);
                        const reportCmtBtn = showReportCmt
                            ? `<span onclick="reportBoardComment('${pidEsc}', '${userEsc}', '${dateEsc}')" style="font-size:10px; color:#ff9800; cursor:pointer; text-decoration:underline; white-space:nowrap;">🚨 신고</span>`
                            : '';
                        // [추가 - 단계 4-2] 본인 + 200점 이상이면 수정 버튼
                        const showEditCmt = canEdit() && String(nick) === String(c.user);
                        const textEscEdit = String(c.text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
                        const editCmtBtn = showEditCmt
                            ? `<span onclick="editBoardComment('${pidEsc}', '${userEsc}', '${dateEsc}', '${textEscEdit}')" style="font-size:10px; color:#2196f3; cursor:pointer; text-decoration:underline; white-space:nowrap;">수정</span>`
                            : '';
                        return `
                        <div style="background:#f9f9f9; padding:10px; border-radius:10px; margin-bottom:8px; font-size:13px; display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                            <div style="flex:1;"><b>${c.user}${cBadge ? ' ' + cBadge : ''}</b>: ${c.text}</div>
                            <div style="display:flex; gap:8px; flex-shrink:0;">
                                ${editCmtBtn}
                                ${reportCmtBtn}
                                <span onclick="deleteBoardComment('${pidEsc}', '${userEsc}', '${dateEsc}')" style="font-size:10px; color:#bbb; cursor:pointer; text-decoration:underline; white-space:nowrap;">삭제</span>
                            </div>
                        </div>`;
                    }).join('') : "<p style='color:#999; font-size:12px;'>첫 댓글을 남겨보세요!</p>"}
                </div>

                <!-- [수정 2026-04-20] 댓글 입력 영역 넘침 해결: flex:1 1 0 + min-width:0 + width:0 로 input 기본 너비 무력화 -->
                <div style="background:#fffde7; padding:15px; border-radius:15px; border:1px solid #FFD400; box-sizing:border-box; max-width:100%;">
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <input type="text" id="bc-nick-${post.id}" value="${nick}" placeholder="닉네임" style="flex:1.5 1 0; min-width:0; width:0; padding:10px; border-radius:8px; border:1px solid #ddd; box-sizing:border-box;">
                        <input type="password" id="bc-pw-${post.id}" placeholder="비번" style="flex:1 1 0; min-width:0; width:0; padding:10px; border-radius:8px; border:1px solid #ddd; box-sizing:border-box;">
                    </div>
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="bc-msg-${post.id}" placeholder="댓글 내용을 입력하세요" style="flex:1 1 0; min-width:0; width:0; padding:10px; border-radius:8px; border:1px solid #ddd; box-sizing:border-box;">
                        <button onclick="submitBoardComment('${post.id}')" style="flex:0 0 auto; background:#FFD400; border:none; border-radius:8px; padding:0 15px; font-weight:bold; cursor:pointer; white-space:nowrap;">등록</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
}

async function submitBoardComment(postId) {
    const nick = document.getElementById(`bc-nick-${postId}`).value;
    const pw = document.getElementById(`bc-pw-${postId}`).value;
    const msg = document.getElementById(`bc-msg-${postId}`).value;

    if (!nick || !pw || !msg) return alert("닉네임, 비번, 내용을 모두 입력하세요!");

    toggleLoading(true, "댓글 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_board_comment", post_id: postId, user: nick, pw: pw, comment: msg });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();

        if (result.res === "ok") {
            alert("댓글이 등록되었습니다!");
            localStorage.setItem('gj-nick', nick);

            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();

            viewPostDetail(postId, false);
        } else {
            alert("오류: " + result.msg);
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [신규] 수다방 댓글 삭제: 작성자 비번 입력 시 삭제
async function deleteBoardComment(postId, originalUser, date) {
    const pw = prompt(`[${originalUser}] 님이 작성한 댓글을 삭제하려면 비밀번호를 입력하세요.`);
    if (!pw) return;

    toggleLoading(true, "댓글 삭제 중...");
    try {
        const q = new URLSearchParams({ type: "delete_board_comment", post_id: postId, user: originalUser, pw: pw, date: date });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("댓글이 삭제되었습니다.");
            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();
            viewPostDetail(postId, false);
        } else {
            alert("오류: " + (result.msg || "삭제에 실패했습니다."));
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [수정] hidden 제거 시 display:flex 명시적으로 설정하여 CSS !important 충돌 해결
function toggleLoading(show, msg = "데이터 저장 중...") {
    const modal = document.getElementById('saving-modal');
    const msgEl = document.getElementById('loading-msg');
    if (msgEl) msgEl.innerText = msg;
    if (show) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // [추가] !important 우회
    } else {
        modal.classList.add('hidden');
        modal.style.display = '';    // [추가] 인라인 스타일 초기화
    }
}

// [수정] 중복 선언 제거 — 하나만 유지
function renderBoardWithHistory() {
    window.history.back();
}

async function submitPost() {
    const title = document.getElementById('b-title').value;
    const nickValue = document.getElementById('b-nick').value;
    const pw = document.getElementById('b-pw').value;
    const content = document.getElementById('b-content').value;
    const fileEl = document.getElementById('b-file');
    // [신규 2026-04-19] 외부 이미지 URL — 서버에서 Drive로 재호스팅
    const imgUrlEl = document.getElementById('b-img-url');
    const imgUrl = imgUrlEl ? imgUrlEl.value.trim() : '';

    if (!title || !nickValue || !pw || !content) return alert("모든 항목을 입력하세요!");
    if (imgUrl && !/^https?:\/\//i.test(imgUrl)) return alert("이미지 URL은 http:// 또는 https://로 시작해야 합니다.");

    toggleLoading(true, "데이터 저장 중...");
    // [수정] image_data(파일 업로드 base64) 또는 image_url(외부 링크) 중 하나를 백엔드로 전송.
    const send = async (imgData, imgUrlStr) => {
        try {
            const res = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    user: nickValue, pw: pw, title: title, content: content,
                    image_data: imgData || "",
                    image_url: imgUrlStr || ""
                })
            });
            const result = await res.json();
            if (result.res === "ok") {
                alert("등록 성공!");
                localStorage.setItem('gj-nick', nickValue);
                currentBoardPage = 1;
                await refreshBoardData();
            } else { alert("실패: " + result.msg); }
        } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
    };

    if (fileEl.files.length > 0) {
        // 파일이 있으면 URL은 무시 (파일 우선)
        const r = new FileReader(); r.onload = () => send(r.result, ""); r.readAsDataURL(fileEl.files[0]);
    } else if (imgUrl) {
        send("", imgUrl);
    } else {
        send("", "");
    }
}

async function refreshBoardData() {
    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
        boardData = await res.json();
        renderBoard();
        document.getElementById('board-page').classList.remove('hidden');
        document.getElementById('floating-menu').style.display = 'none';
        console.log("✅ 수다방 데이터 최신화 및 화면 유지 완료");
    } catch (e) {
        console.error("데이터 갱신 실패:", e);
    }
}

async function submitReport() {
    const nick = document.getElementById('nick').value.trim();
    const pw = document.getElementById('p-pw').value;
    const name = document.getElementById('pname').value.trim();
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    // [신규 2026-04-20] 주차장 사진 업로드 지원 (파일 또는 URL)
    const fileEl = document.getElementById('p-file');
    const imgUrlEl = document.getElementById('p-img-url');
    const imgUrl = imgUrlEl ? imgUrlEl.value.trim() : '';

    if (!nick || !pw || !name) return alert("닉네임, 비번, 장소명은 필수입니다!");
    if (!pickMarker) return alert("지도를 클릭하여 위치를 먼저 선택해주세요!");
    if (imgUrl && !/^https?:\/\//i.test(imgUrl)) return alert("이미지 URL은 http:// 또는 https://로 시작해야 합니다.");

    toggleLoading(true, "제보 등록 중...");
    // [수정 2026-04-20] GET → POST 전환: base64 이미지 용량 때문에 URL 쿼리스트링은 한계.
    // 서버는 동일 엔드포인트에서 body.type === "report"로 라우팅.
    const send = async (imgData) => {
        try {
            const res = await fetch(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    type: "report",
                    user: nick, pw: pw,
                    name: name, ptype: type, addr: addrStr, desc: desc,
                    lat: pickMarker.getPosition().lat(),
                    lng: pickMarker.getPosition().lng(),
                    image_data: imgData || "",
                    image_url: imgUrl || ""
                })
            });
            const result = await res.json();
            if (result.res === "ok") {
                alert("제보 완료!");
                localStorage.setItem('gj-nick', nick);
                location.reload();
            } else { alert("오류: " + result.msg); }
        } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
    };

    if (fileEl && fileEl.files && fileEl.files.length > 0) {
        // 파일 우선. URL은 서버에서 무시됨.
        const r = new FileReader();
        r.onload = () => send(r.result);
        r.readAsDataURL(fileEl.files[0]);
    } else {
        send("");
    }
}

async function deleteReport(name, lat, lng) {
    const pw = prompt("제보 시 입력한 비밀번호를 입력하세요.");
    if (!pw) return;

    toggleLoading(true, "데이터 삭제 중입니다...");
    try {
        const q = new URLSearchParams({ type: "delete_report", name: name, lat: lat, lng: lng, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("삭제되었습니다."); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
}

async function deletePost(postId) {
    const pw = prompt("글 작성 시 비밀번호를 입력하세요.");
    if (!pw) return;
    const q = new URLSearchParams({ type: "delete_post", post_id: postId, pw: pw });

    toggleLoading(true, "게시글 삭제 중입니다...");
    try {
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("글 삭제 성공!");
            await refreshBoardData();
        } else { alert("실패: " + result.msg); }
    } catch (e) { alert("통신 오류"); } finally { toggleLoading(false); }
}

// [신규 2026-04-20] 사용자가 지도에 위치를 찍을 때 표시되는 Pick 마커 (임시 선택 위치)
// - 일반 주차장 마커(노란 역물방울)와 확실히 차별화 → 빨간/핑크 타겟 모양 + "여기!" 라벨
// - 위아래 바운싱(bob) 애니메이션 + 초기 드롭인 결합
// [수정 2026-04-20] Pick 마커: '여기!' 라벨 제거 + 아래로 뾰족해지는 화살표 모양으로 교체
// - 위쪽은 넓고, 아래로 갈수록 홀쭉해져 끝점이 클릭한 지점을 정확히 가리킴
// - 빨간색 컬러 팔레트 유지 + 드롭 애니메이션 + 위아래 바운스 + 확산 펄스
function buildPickMarkerContent() {
    // [수정 2026-04-20] 크기 3분의 2로 축소 — 40x56 → 27x37, 앵커도 비례 조정
    return `<div class="gj-pick-marker gj-pick-drop">
        <div class="gj-pick-pulse"></div>
        <svg class="gj-pick-svg" viewBox="0 0 40 56" width="27" height="37" aria-hidden="true">
            <!-- 바닥 그림자 -->
            <ellipse cx="20" cy="53" rx="6" ry="1.8" fill="rgba(0,0,0,0.3)"/>
            <!-- 아래로 뾰족해지는 화살표(넓은 머리 → 가늘어지는 몸통 → 끝점)
                 위쪽: 넓은 상단 (곡선으로 부드럽게)
                 아래쪽: 뾰족한 삼각 끝 — 정확히 (20, 52)에 위치 -->
            <path d="M 20 2
                     C 28 2, 35 6, 35 14
                     C 35 20, 31 24, 27 28
                     L 22 48
                     L 20 52
                     L 18 48
                     L 13 28
                     C 9 24, 5 20, 5 14
                     C 5 6, 12 2, 20 2 Z"
                  fill="#FF3B30"
                  stroke="#1c2633"
                  stroke-width="2.5"
                  stroke-linejoin="round"/>
            <!-- 내부 하이라이트 (위쪽 넓은 부분에 흰 동그라미) -->
            <circle cx="20" cy="14" r="5" fill="#FFF"/>
            <!-- 내부 아래 방향 표시(▾) -->
            <path d="M 16 12 L 20 17 L 24 12 Z" fill="#FF3B30"/>
        </svg>
    </div>`;
}

// [신규 2026-04-20] 내 위치 자동차 마커 — 주차 정보 근처로 이동 중임을 시각화
// - 파란 팔레트(빨간 Pick·노란 주차 마커와 충돌 안 함)
// - 자동차 이모티콘이 들어간 둥근 배지 + 확산 accuracy 링
// - watchPosition으로 라이브 업데이트
// [수정 v2 2026-04-20] 내 위치 마커 시인성 튜닝 — 원형 배지 없이, 큰 🚗 + 노란 소프트 halo + 주행감 애니메이션
// - 파란 원/accuracy 링은 여전히 제거 (주차 마커 가림 문제 해결 유지)
// - 크기 up + halo + 상하 바운스 + 살짝 좌우 틸트 → 움직임으로 시선 집중
function buildUserLocMarkerContent() {
    return `<div class="gj-userloc-marker">
        <div class="gj-userloc-halo"></div>
        <span class="gj-userloc-car">🚗</span>
    </div>`;
}

function updateUserLocMarker(lat, lng) {
    if (!map || typeof naver === 'undefined') return;
    const pos = new naver.maps.LatLng(lat, lng);
    if (!userLocMarker) {
        userLocMarker = new naver.maps.Marker({
            position: pos,
            map: map,
            icon: {
                content: buildUserLocMarkerContent(),
                // 🚗 정중앙이 실제 좌표와 일치 (40x40 컨테이너 중심)
                anchor: new naver.maps.Point(20, 20)
            },
            zIndex: 250,
            clickable: false
        });
    } else {
        userLocMarker.setPosition(pos);
    }
}

// [신규 2026-04-20] 위치 라이브 추적 시작 (한 번만 실행)
function startUserLocWatch() {
    if (userLocWatchId !== null) return;
    if (!navigator.geolocation || !navigator.geolocation.watchPosition) return;
    userLocWatchId = navigator.geolocation.watchPosition(
        (p) => {
            currentUserPos = { lat: p.coords.latitude, lng: p.coords.longitude };
            updateUserLocMarker(p.coords.latitude, p.coords.longitude);
        },
        () => { /* 권한 거부·오류 — 조용히 무시 */ },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}

function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({
            position: e.coord,
            map: map,
            icon: {
                content: buildPickMarkerContent(),
                // [수정 2026-04-20] 3분의 2 축소 → 화살표 끝점이 (13, 35)
                anchor: new naver.maps.Point(13, 35)
            },
            zIndex: 300
        });
        naver.maps.Service.reverseGeocode({ coords: e.coord, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',') }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) { addrStr = res.v2.address.roadAddress || res.v2.address.jibunAddress; }
        });
    });
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        // [수정 2026-04-20] 현재 위치 업데이트 + 가까운 주차 위젯 재계산 + 내 위치 마커 갱신
        currentUserPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        renderNearbyWidget();
        updateUserLocMarker(pos.coords.latitude, pos.coords.longitude);
        startUserLocWatch();
    });
}

function openModal() {
    if (!pickMarker) return alert("지도를 클릭해 위치를 먼저 선택해주세요!");
    document.getElementById('addr-text').innerText = "📍 " + addrStr;
    document.getElementById('modal').classList.remove('hidden');
    history.pushState({ view: 'modal' }, "제보하기", "#report");
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// =================================================
// [신규 2026-04-20] 공지사항 모달 — 첫 진입 시 1회(옵션 체크 시 하루 1회)
// =================================================
function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function maybeShowNotice() {
    try {
        const skipUntil = localStorage.getItem('gj-notice-skip-date');
        if (skipUntil === todayKey()) return; // 오늘 이미 보지 않기로 체크함
    } catch (e) { /* localStorage 접근 실패 시엔 그냥 노출 */ }
    const m = document.getElementById('notice-modal');
    if (m) m.classList.remove('hidden');
}
function closeNotice() {
    const m = document.getElementById('notice-modal');
    if (!m) return;
    const cb = document.getElementById('notice-dismiss-today');
    if (cb && cb.checked) {
        try { localStorage.setItem('gj-notice-skip-date', todayKey()); } catch (e) {}
    }
    m.classList.add('hidden');
}

window.onload = () => { preFetchData(); initMap(); };

// [수정] onpopstate 강화: 지도 화면에서 뒤로가기 시 앱 이탈 방지
window.onpopstate = function(event) {
    const state = event.state;
    const modal = document.getElementById('modal');
    const boardPage = document.getElementById('board-page');
    const rankingPage = document.getElementById('ranking-page');

    // 1. 모달 열려 있으면 닫기
    if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        return;
    }

    // 2. 수다방 열려 있으면 제어
    if (boardPage && !boardPage.classList.contains('hidden')) {
        if (state && state.view === 'post') {
            viewPostDetail(state.id, false);
        } else if (state && state.view === 'board') {
            renderBoard();
        } else {
            closeBoard();
        }
        return;
    }

    // [신규 - 단계 3] 3. 랭킹 페이지 열려 있으면 닫기
    if (rankingPage && !rankingPage.classList.contains('hidden')) {
        closeRanking();
        return;
    }

    // [추가] 3. 지도 화면(아무것도 열려있지 않음)에서 뒤로가기 누르면
    //          히스토리 스택에 빈 상태를 하나 더 쌓아서 앱 이탈 방지
    history.pushState(null, "", window.location.pathname);
    alert("앱을 종료하려면 한 번 더 뒤로가기를 눌러주세요.");
    // 두 번 연속 뒤로가기 시 자연스럽게 이탈되도록 플래그 없이 둠
};
