/**
 * 거지주차.com 통합 스크립트 (V.최종 보정본)
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 
var boardData = [];

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby32JfhoHkE4J4V6A0jjVP_c2CoRbfO_NlaBul5IU-AL0G897piqHpNmEGOPXWhJxM/exec";

// 1. 초기 데이터 수급 (병렬 처리)
async function preFetchData() {
    console.log("🚀 데이터 병렬 동기화 시작...");
    const fetchSheet = fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`).then(res => res.json());
    const fetchSeoul = fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`).then(res => res.json());
    const fetchBoard = fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`).then(res => res.json());

    try {
        const results = await Promise.allSettled([fetchSheet, fetchSeoul, fetchBoard]);
        if (results[0].status === 'fulfilled') preloadedData.push(...results[0].value);
        if (results[1].status === 'fulfilled') preloadedData.push(...results[1].value);
        if (results[2].status === 'fulfilled') boardData = results[2].value;

        isDataLoaded = true;
        if (map) renderAllMarkers();
    } catch (e) { console.error("데이터 로드 에러:", e); }
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
        const screen = document.getElementById('loading-screen');
        if (screen) { screen.style.opacity = '0'; setTimeout(() => { screen.style.display = 'none'; }, 500); }
        if (isDataLoaded) renderAllMarkers();
    });
    setupEvents();
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

// [1번 오류 해결] 주차 정보 상세창 - 댓글/평점 및 입력칸 복구
function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    
    // 댓글 목록 생성 로직
    let commentsHtml = item.comments && item.comments.length > 0 ? item.comments.map(c => `
        <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
            <div style="font-size:11px; font-weight:bold; color:#555;">${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
            <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
        </div>`).join('') : "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";

    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap"><b>${item.name}</b></div>
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

// [보정] 별점 UI: 클릭 시 노란색으로 즉각 변경되도록 스타일 강제 부여
function setRatingUI(id, score) {
    const stars = document.querySelectorAll(`#star-wrap-${id} .star-btn`);
    const input = document.getElementById(`rate-val-${id}`);
    if(input) input.value = score;
    
    stars.forEach((s, i) => {
        // [수정] CSS 클래스 대신 직접 스타일을 제어하여 확실하게 반응하게 함
        if (i < score) {
            s.style.color = "#FFD400"; // 활성 색상
        } else {
            s.style.color = "#ddd"; // 비활성 색상
        }
    });
}

// [보정] 후기 등록 함수: 등록 후 지도로 튕기지 않고 상태 유지
async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const savedNick = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;
    
    if (!msg) return alert("내용을 입력해주세요!");

    toggleLoading(true, "후기 등록 중...");
    try {
        const q = new URLSearchParams({ type: "add_comment", target_id: targetName, user: savedNick, comment: msg, rating: rate });
        // GET 전송의 안정성을 위해 fetch 호출 형식을 보정함
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        
        if (result.res === "ok") {
            alert("후기가 등록되었습니다!");
            location.reload(); // 지도의 마커 데이터를 갱신하기 위해 지도는 새로고침 유지
        }
    } catch (e) {
        alert("등록 중 통신 오류가 발생했습니다.");
    } finally {
        toggleLoading(false);
    }
}

// [2번 오류 해결] 수다방 진입 시 즉시 렌더링 보정
function openBoard() {
    const boardPage = document.getElementById('board-page');
    boardPage.classList.remove('hidden');
    document.getElementById('floating-menu').style.display = 'none';
    
    // 데이터 수급이 완료되었는지 확인 후 즉시 렌더링
    if (boardData.length > 0) {
        renderBoard();
    } else {
        // 데이터가 아직 없다면 로딩 표시 후 가져오기 시도
        renderBoard(); 
        fetchBoard(); 
    }
}

function closeBoard() {
    document.getElementById('board-page').classList.add('hidden');
    document.getElementById('floating-menu').style.display = 'flex';
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

function viewPostDetail(postId) {
    const post = boardData.find(p => String(p.id) === String(postId));
    if (!post) return;
    document.getElementById('board-content').innerHTML = `
        <div class="post-detail">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <button onclick="renderBoard()" class="back-btn">← 목록</button>
                <button onclick="deletePost('${post.id}')" style="color:#ff4d4d; border:none; background:none; text-decoration:underline; cursor:pointer;">글 삭제</button>
            </div>
            <h2>${post.title}</h2>
            <div style="font-size:12px; color:#999; margin-bottom:15px;">작성자: ${post.author}</div>
            ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:10px; margin-bottom:15px;">` : ""}
            <p style="white-space:pre-wrap;">${post.content}</p>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
}

// [보정] 로딩 모달 제어 함수 (문구 변경 기능 추가)
function toggleLoading(show, msg = "데이터 저장 중...") {
    const modal = document.getElementById('saving-modal');
    const msgEl = document.getElementById('loading-msg');
    if (msgEl) msgEl.innerText = msg;
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// [수정] 수다방 게시글 등록 함수
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
                // [핵심 보정] 리로드 대신 데이터만 갱신하고 수다방 화면 유지
                await refreshBoardData(); 
            } else { alert("실패: " + result.msg); }
        } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
    };

    if (fileEl.files.length > 0) {
        const r = new FileReader(); r.onload = () => send(r.result); r.readAsDataURL(fileEl.files[0]);
    } else { send(""); }
}

// [추가] 게시판 데이터 갱신 및 화면 유지 전용 함수
async function refreshBoardData() {
    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
        boardData = await res.json(); // 최신 목록 확보
        
        renderBoard(); // 목록 다시 그리기
        
        // [핵심] 지도로 나가지 않도록 수다방 페이지를 강제로 활성화 유지
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

    toggleLoading(true);
    try {
        const q = new URLSearchParams({ type: "report", user: nick, pw: pw, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("제보 완료!"); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
}

// [3번 오류 해결] 삭제 시 "삭제 중입니다" 모달 적용
async function deleteReport(name, lat, lng) {
    const pw = prompt("제보 시 입력한 비밀번호를 입력하세요.");
    if (!pw) return;

    toggleLoading(true, "데이터 삭제 중입니다..."); // 삭제 모달 켜기
    try {
        const q = new URLSearchParams({ type: "delete_report", name: name, lat: lat, lng: lng, pw: pw });
        const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
        const result = await res.json();
        if (result.res === "ok") { alert("삭제되었습니다."); location.reload(); }
        else { alert("오류: " + result.msg); }
    } catch (e) { alert("연결 오류"); } finally { toggleLoading(false); }
}

// [수정] 수다글 삭제 함수도 동일하게 보정
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
            await refreshBoardData(); // 리로드 없이 즉시 목록 갱신
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

function moveToMyLoc() { navigator.geolocation.getCurrentPosition((pos) => { if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude)); }); }
function openModal() { if (!pickMarker) return alert("위치 선택!"); document.getElementById('addr-text').innerText = "📍 " + addrStr; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

window.onload = () => { preFetchData(); initMap(); };