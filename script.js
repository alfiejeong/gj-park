/**
 * 거지주차.com 통합 스크립트 (V.최종 무결성 강화본)
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 
var boardData = [];

// [주의] 본인의 SCRIPT_URL로 교체하십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXKgILokyuFRRaxBHSj1tzRKliQ_ohe8BmO0QoW1O3VVgSYqJBnO0vRB_TcQNVMef_/exec";

async function preFetchData() {
    console.log("🚀 데이터 병렬 동기화 시작...");
    toggleLoading(true, "주차 정보 조회 중..."); 

    const t = new Date().getTime();
    const fetchSheet = fetch(`${SCRIPT_URL}?type=sheet&t=${t}`).then(res => res.json());
    const fetchSeoul = fetch(`${SCRIPT_URL}?type=seoul&t=${t}`).then(res => res.json());
    const fetchBoard = fetch(`${SCRIPT_URL}?type=get_board&t=${t}`).then(res => res.json());

    try {
        const results = await Promise.allSettled([fetchSheet, fetchSeoul, fetchBoard]);
        results.forEach((result, idx) => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                if (idx === 0 || idx === 1) preloadedData.push(...result.value);
                else boardData = result.value;
            }
        });
        isDataLoaded = true;
        const splashText = document.querySelector('#loading-screen p');
        if (splashText) splashText.innerText = "명당 지도 생성 중...";
        if (map) renderAllMarkers();
    } catch (e) { console.error("데이터 로드 에러:", e); }
    finally { toggleLoading(false); }
}

function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);
    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => { setupMap(37.5665, 126.9780); }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', { center: new naver.maps.LatLng(lat, lng), zoom: 15 });
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        if (isDataLoaded) hideSplashScreen();
    });
    setupEvents();
}

function hideSplashScreen() {
    const screen = document.getElementById('loading-screen');
    if (screen && screen.style.display !== 'none') {
        screen.style.opacity = '0';
        setTimeout(() => { screen.style.display = 'none'; }, 500);
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
}

function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    const nick = localStorage.getItem('gj-nick') || "";
    
    let commentsHtml = item.comments && item.comments.length > 0 ? item.comments.map(c => `
        <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9; display:flex; justify-content:space-between;">
            <div>
                <div style="font-size:11px; font-weight:bold; color:#555;">${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
                <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
            </div>
            <span onclick="deleteFeedback('${item.name}', '${c.user}')" style="font-size:10px; color:#ccc; cursor:pointer; text-decoration:underline;">삭제</span>
        </div>`).join('') : "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";

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
            <div class="comment-list" style="max-height:100px; overflow-y:auto; border-top:1px solid #FFD400; margin:10px 0;">${commentsHtml}</div>
            <div class="feedback-section" style="border-top:1px dashed #ddd; padding-top:10px;">
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="text" id="cmt-nick-${idSafe}" value="${nick}" placeholder="닉네임" style="flex:1.5; padding:8px; font-size:11px; border:1px solid #eee; border-radius:8px;">
                    <input type="password" id="cmt-pw-${idSafe}" placeholder="비번" style="flex:1; padding:8px; font-size:11px; border:1px solid #eee; border-radius:8px;">
                </div>
                <div class="star-rating" id="star-wrap-${idSafe}" style="display:flex; justify-content:center; gap:5px; margin-bottom:5px;">
                    ${[1,2,3,4,5].map(n => `<span class="star-btn" style="cursor:pointer; font-size:18px; color:#ddd;" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <div style="display:flex; gap:5px;">
                    <input type="text" id="cmt-msg-${idSafe}" placeholder="후기 입력" style="flex:1; padding:8px; font-size:12px; border:1px solid #eee; border-radius:10px;">
                    <button onclick="sendFeedback('${item.name}')" style="background:#FFD400; border:none; border-radius:10px; padding:0 10px; font-weight:bold; font-size:11px;">등록</button>
                </div>
            </div>
            <div style="text-align: right; margin-top: 10px; border-top:1px solid #eee; padding-top:5px;">
                <span onclick="deleteReport('${item.name}', ${item.lat}, ${item.lng})" style="font-size:10px; color:#999; cursor:pointer; text-decoration:underline;">제보 삭제 요청</span>
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
    if(input) input.value = score;
    stars.forEach((s, i) => { s.style.color = i < score ? "#FFD400" : "#ddd"; });
}

async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const nick = document.getElementById(`cmt-nick-${idSafe}`).value;
    const pw = document.getElementById(`cmt-pw-${idSafe}`).value;
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;
    if (!nick || !pw || !msg) return alert("닉네임, 비번, 내용을 입력하세요!");

    toggleLoading(true, "후기 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_comment", target_id: targetName, user: nick, pw: pw, comment: msg, rating: rate });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("등록 성공!"); localStorage.setItem('gj-nick', nick); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("통신 에러"); } finally { toggleLoading(false); }
}

async function deleteFeedback(targetName, userName) {
    const pw = prompt(`'${userName}'님의 비밀번호를 입력하세요.`);
    if (!pw) return;
    toggleLoading(true, "삭제 중...");
    try {
        const q = new URLSearchParams({ type: "delete_comment", target_id: targetName, user: userName, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("삭제되었습니다."); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("통신 에러"); } finally { toggleLoading(false); }
}

function openBoard() {
    document.getElementById('board-page').classList.remove('hidden');
    document.getElementById('floating-menu').style.display = 'none';
    history.pushState({ view: 'board' }, "수다방", "#board");
    renderBoard();
}

function closeBoard() {
    document.getElementById('board-page').classList.add('hidden');
    document.getElementById('floating-menu').style.display = 'flex';
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
}

function renderBoard() {
    const content = document.getElementById('board-content');
    document.getElementById('write-btn').style.display = 'block';
    content.innerHTML = `<div id="post-list">${boardData.map(p => `
        <div class="post-card" onclick="viewPostDetail('${p.id}')">
            <div style="font-size:12px; color:#999;">${p.author}</div>
            <h3 style="margin:5px 0;">${p.title}</h3>
        </div>`).join('')}</div>`;
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
    if (isPush) history.pushState({ view: 'post', id: postId }, "글상세", "#post" + postId);
    const nick = localStorage.getItem('gj-nick') || "";
    document.getElementById('board-content').innerHTML = `
        <div class="post-detail">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <button onclick="window.history.back()" class="back-btn">← 목록</button>
                <button onclick="deletePost('${post.id}')" style="color:#ff4d4d; border:none; background:none; text-decoration:underline; cursor:pointer;">글 삭제</button>
            </div>
            <h2>${post.title}</h2>
            <div style="font-size:12px; color:#999; margin-bottom:15px;">작성자: ${post.author} | ${new Date(post.date).toLocaleString()}</div>
            ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:10px; margin-bottom:15px;">` : ""}
            <p style="white-space:pre-wrap; margin-bottom:30px;">${post.content}</p>
            <div class="detail-comments" style="border-top:2px solid #FFD400; padding-top:20px;">
                <h5>댓글 (${post.comments ? post.comments.length : 0})</h5>
                <div id="b-comment-list" style="margin-bottom:20px;">
                    ${post.comments && post.comments.length > 0 ? post.comments.map(c => `
                        <div style="background:#f9f9f9; padding:10px; border-radius:10px; margin-bottom:8px; font-size:13px; display:flex; justify-content:space-between;">
                            <div><b>${c.user}</b>: ${c.text}</div>
                            <span onclick="deleteBoardComment('${post.id}', '${c.user}', '${c.text.replace(/'/g, "\\'")}')" style="font-size:10px; color:#ccc; cursor:pointer;">삭제</span>
                        </div>`).join('') : "<p style='color:#999; font-size:12px;'>첫 댓글을 남겨보세요!</p>"}
                </div>
                <div style="background:#fffde7; padding:15px; border-radius:15px; border:1px solid #FFD400;">
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <input type="text" id="bc-nick-${post.id}" value="${nick}" placeholder="닉네임" style="flex:1.5; padding:10px; border-radius:8px; border:1px solid #ddd;">
                        <input type="password" id="bc-pw-${post.id}" placeholder="비번" style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
                    </div>
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="bc-msg-${post.id}" placeholder="댓글 입력" style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
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
    if (!nick || !pw || !msg) return alert("필수 입력!");
    toggleLoading(true, "댓글 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_board_comment", post_id: postId, user: nick, pw: pw, comment: msg });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("등록되었습니다!"); localStorage.setItem('gj-nick', nick);
            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();
            viewPostDetail(postId, false);
        } else { alert("오류: " + result.msg); }
    } catch (e) { alert("통신 오류"); } finally { toggleLoading(false); }
}

async function deleteBoardComment(postId, userName, commentText) {
    const pw = prompt(`'${userName}'님의 비밀번호를 입력하세요.`);
    if (!pw) return;
    toggleLoading(true, "삭제 중...");
    try {
        const q = new URLSearchParams({ type: "delete_board_comment", post_id: postId, user: userName, pw: pw, comment: commentText });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") {
            alert("삭제되었습니다.");
            const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
            boardData = await refreshRes.json();
            viewPostDetail(postId, false);
        } else { alert("오류: " + result.msg); }
    } catch (e) { alert("통신 오류"); } finally { toggleLoading(false); }
}

function toggleLoading(show, msg = "데이터 처리 중...") {
    const modal = document.getElementById('saving-modal');
    const msgEl = document.getElementById('loading-msg');
    if (msgEl) msgEl.innerText = msg;
    if (show) modal.classList.remove('hidden'); else modal.classList.add('hidden');
}

async function refreshBoardData() {
    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
        boardData = await res.json();
        renderBoard();
        document.getElementById('board-page').classList.remove('hidden');
        document.getElementById('floating-menu').style.display = 'none';
    } catch (e) { console.error("갱신 실패"); }
}

async function submitPost() {
    const title = document.getElementById('b-title').value;
    const nickValue = document.getElementById('b-nick').value;
    const pw = document.getElementById('b-pw').value;
    const content = document.getElementById('b-content').value;
    const fileEl = document.getElementById('b-file');
    if (!title || !nickValue || !pw || !content) return alert("필수 입력!");
    toggleLoading(true, "저장 중...");
    const send = async (img) => {
        try {
            const res = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ user: nickValue, pw: pw, title: title, content: content, image_data: img })
            });
            const result = await res.json();
            if (result.res === "ok") { alert("등록 성공!"); localStorage.setItem('gj-nick', nickValue); await refreshBoardData(); }
            else { alert("실패: " + result.msg); }
        } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
    };
    if (fileEl.files.length > 0) {
        const r = new FileReader(); r.onload = () => send(r.result); r.readAsDataURL(fileEl.files[0]);
    } else { send(""); }
}

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const pw = document.getElementById('p-pw').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !pw || !name) return alert("필수 입력!");
    toggleLoading(true, "제보 저장 중...");
    try {
        const q = new URLSearchParams({ type: "report", user: nick, pw: pw, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("제보 완료!"); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
}

async function deleteReport(name, lat, lng) {
    const pw = prompt("비밀번호를 입력하세요.");
    if (!pw) return;
    toggleLoading(true, "삭제 중...");
    try {
        const q = new URLSearchParams({ type: "delete_report", name: name, lat: lat, lng: lng, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("삭제 완료!"); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("오류"); } finally { toggleLoading(false); }
}

async function deletePost(postId) {
    const pw = prompt("비밀번호를 입력하세요.");
    if (!pw) return;
    toggleLoading(true, "삭제 중...");
    try {
        const q = new URLSearchParams({ type: "delete_post", post_id: postId, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("삭제 성공!"); await refreshBoardData(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("오류"); } finally { toggleLoading(false); }
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

function moveToMyLoc() { navigator.geolocation.getCurrentPosition((pos) => { if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude)); }); }
function openModal() { if (!pickMarker) return alert("위치 선택!"); document.getElementById('addr-text').innerText = "📍 " + addrStr; document.getElementById('modal').classList.remove('hidden'); history.pushState({ view: 'modal' }, "제보하기", "#report"); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

window.onload = () => { preFetchData(); initMap(); };
window.onpopstate = function(event) {
    const state = event.state;
    const modal = document.getElementById('modal');
    const boardPage = document.getElementById('board-page');
    if (modal && !modal.classList.contains('hidden')) { modal.classList.add('hidden'); return; }
    if (boardPage && !boardPage.classList.contains('hidden')) {
        if (state && state.view === 'post') viewPostDetail(state.id, false);
        else if (state && state.view === 'board') renderBoard();
        else closeBoard();
    }
};