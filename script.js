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

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyRC2Gr1osh7hKm3eQB_AVErjeZ7nN8PmFGbpkIkbGWv46xsUZJ3kq7ozVH2VV8lf_E/exec";

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

    try {
        const results = await Promise.allSettled([fetchSheet, fetchSeoul, fetchBoard]);

        results.forEach((result, idx) => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                if (idx === 0 || idx === 1) {
                    preloadedData.push(...result.value);
                } else {
                    boardData = result.value;
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
            renderBoard();
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
    if (window.location.hash === '#ranking') history.replaceState(null, "", window.location.pathname);
}

// 2. 지도 및 마커 렌더링
function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);
    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => { setupMap(37.5665, 126.9780); }, { timeout: 3000 });
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
        }, 500);
    }
}

function renderAllMarkers() {
    if (!map) return;
    preloadedData.forEach(item => {
        if (!item.isRendered) {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(item.lat, item.lng),
                map: map,
                icon: { content: `<div class="label-saved">${item.type}</div>`, anchor: new naver.maps.Point(30, 15) }
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

    let commentsHtml = item.comments && item.comments.length > 0 ? item.comments.map(c => {
        const userEsc = String(c.user).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:11px; font-weight:bold; color:#555;">${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
                <span onclick="deleteSpotComment('${nameEsc}', '${userEsc}')" style="font-size:10px; color:#bbb; cursor:pointer; text-decoration:underline;">삭제</span>
            </div>
            <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
        </div>`;
    }).join('') : "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";

    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <b style="font-size:18px;">${item.name}</b>
                <span style="color:#f39c12; font-weight:bold; font-size:14px;">⭐ ${item.avgRating || '0.0'}</span>
            </div>

            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
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

    history.pushState({ view: 'board' }, "수다방", "#board");

    currentBoardPage = 1; // [추가] 수다방 진입 시 1페이지로 초기화

    if (boardData.length > 0) {
        renderBoard();
    } else {
        renderBoard();
        fetchBoard(); // [수정] 이제 fetchBoard 함수가 정의되어 있음
    }
}

function closeBoard() {
    document.getElementById('board-page').classList.add('hidden');
    document.getElementById('floating-menu').style.display = 'flex';
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
}

function renderBoard() {
    const content = document.getElementById('board-content');
    document.getElementById('write-btn').style.display = 'block';
    if (boardData.length === 0) {
        content.innerHTML = `<div style="text-align:center; color:#999; padding:40px; font-size:14px;">아직 수다가 없어요. 첫 글을 남겨보세요! 🙌</div>`;
        return;
    }

    // [추가] 페이지네이션 계산
    const total = boardData.length;
    const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    if (currentBoardPage > totalPages) currentBoardPage = totalPages;
    if (currentBoardPage < 1) currentBoardPage = 1;

    const startIdx = (currentBoardPage - 1) * POSTS_PER_PAGE;
    const endIdx = startIdx + POSTS_PER_PAGE;
    const pageData = boardData.slice(startIdx, endIdx);

    const postListHtml = pageData.map(p => {
        const pidEsc = String(p.id).replace(/'/g, "\\'");
        return `
        <div class="post-card" onclick="viewPostDetail('${pidEsc}')">
            <div style="font-size:12px; color:#999;">${p.author}</div>
            <h3 style="margin:5px 0;">${p.title}</h3>
        </div>`;
    }).join('');

    const paginationHtml = renderPagination(currentBoardPage, totalPages);

    content.innerHTML = `<div id="post-list">${postListHtml}</div>${paginationHtml}`;
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

    const nick = localStorage.getItem('gj-nick') || "";
    document.getElementById('board-content').innerHTML = `
        <div class="post-detail">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <button onclick="renderBoardWithHistory()" class="back-btn">← 목록</button>
                <button onclick="deletePost('${post.id}')" style="color:#ff4d4d; border:none; background:none; text-decoration:underline; cursor:pointer;">글 삭제</button>
            </div>
            <h2>${post.title}</h2>
            <div style="font-size:12px; color:#999; margin-bottom:15px;">작성자: ${post.author} | ${new Date(post.date).toLocaleString()}</div>
            ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:10px; margin-bottom:15px;">` : ""}
            <p style="white-space:pre-wrap; margin-bottom:30px;">${post.content}</p>

            <div class="detail-comments" style="border-top:2px solid #FFD400; padding-top:20px;">
                <h5>댓글 (${post.comments ? post.comments.length : 0})</h5>
                <div id="b-comment-list" style="margin-bottom:20px;">
                    ${post.comments && post.comments.length > 0 ? post.comments.map(c => {
                        const userEsc = String(c.user).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        const dateEsc = String(c.date || '').replace(/'/g, "\\'");
                        const pidEsc = String(post.id).replace(/'/g, "\\'");
                        return `
                        <div style="background:#f9f9f9; padding:10px; border-radius:10px; margin-bottom:8px; font-size:13px; display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                            <div style="flex:1;"><b>${c.user}</b>: ${c.text}</div>
                            <span onclick="deleteBoardComment('${pidEsc}', '${userEsc}', '${dateEsc}')" style="font-size:10px; color:#bbb; cursor:pointer; text-decoration:underline; white-space:nowrap;">삭제</span>
                        </div>`;
                    }).join('') : "<p style='color:#999; font-size:12px;'>첫 댓글을 남겨보세요!</p>"}
                </div>

                <div style="background:#fffde7; padding:15px; border-radius:15px; border:1px solid #FFD400;">
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <input type="text" id="bc-nick-${post.id}" value="${nick}" placeholder="닉네임" style="flex:1.5; padding:10px; border-radius:8px; border:1px solid #ddd;">
                        <input type="password" id="bc-pw-${post.id}" placeholder="비번" style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
                    </div>
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="bc-msg-${post.id}" placeholder="댓글 내용을 입력하세요" style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
                        <button onclick="submitBoardComment('${post.id}')" style="background:#FFD400; border:none; border-radius:8px; padding:0 15px; font-weight:bold; cursor:pointer;">등록</button>
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

    if (!title || !nickValue || !pw || !content) return alert("모든 항목을 입력하세요!");

    toggleLoading(true, "데이터 저장 중...");
    const send = async (img) => {
        try {
            const res = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ user: nickValue, pw: pw, title: title, content: content, image_data: img })
            });
            const result = await res.json();
            if (result.res === "ok") {
                alert("등록 성공!");
                localStorage.setItem('gj-nick', nickValue);
                currentBoardPage = 1; // [추가] 새 글은 1페이지 맨 위에 오므로 1페이지로 이동
                await refreshBoardData();
            } else { alert("실패: " + result.msg); }
        } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
    };

    if (fileEl.files.length > 0) {
        const r = new FileReader(); r.onload = () => send(r.result); r.readAsDataURL(fileEl.files[0]);
    } else { send(""); }
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
    const nick = document.getElementById('nick').value;
    const pw = document.getElementById('p-pw').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;

    if (!nick || !pw || !name) return alert("닉네임, 비번, 장소명은 필수입니다!");

    // [추가] pickMarker null 체크
    if (!pickMarker) return alert("지도를 클릭하여 위치를 먼저 선택해주세요!");

    toggleLoading(true);
    try {
        const q = new URLSearchParams({ type: "report", user: nick, pw: pw, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("제보 완료!");
            localStorage.setItem('gj-nick', nick); // [추가] 닉네임 저장 일관성
            location.reload();
        } else { alert("오류: " + result.msg); }
    } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
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

function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({ position: e.coord, map: map });
        naver.maps.Service.reverseGeocode({ coords: e.coord, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',') }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) { addrStr = res.v2.address.roadAddress || res.v2.address.jibunAddress; }
        });
    });
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
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
