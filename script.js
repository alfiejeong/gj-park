/**
 * [거지주차.com] 통합 클라이언트 스크립트
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 
var boardData = [];

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKGdxS-wO3BG9XV2ME6TJM8LAQwkTEFNz7_ysn7ZJ_gzgha6BJDs5GQ1KXGRkCawg/exec";

// 데이터 병렬 수급
async function preFetchData() {
    const fetchSheet = fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`).then(res => res.json());
    const fetchSeoul = fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`).then(res => res.json());
    const fetchBoard = fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`).then(res => res.json());

    try {
        const results = await Promise.allSettled([fetchSheet, fetchSeoul, fetchBoard]);
        if (results[0].status === 'fulfilled') preloadedData.push(...results[0].value);
        if (results[1].status === 'fulfilled') preloadedData.push(...results[1].value);
        if (results[2].status === 'fulfilled') {
            boardData = results[2].value;
            if (!document.getElementById('board-page').classList.contains('hidden')) renderBoard();
        }
        isDataLoaded = true;
        if (map) renderAllMarkers();
    } catch (e) { console.error("데이터 수급 실패:", e); }
}

function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);
    navigator.geolocation.getCurrentPosition((pos) => { setupMap(pos.coords.latitude, pos.coords.longitude); }, 
    () => { setupMap(37.5665, 126.9780); }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', { center: new naver.maps.LatLng(lat, lng), zoom: 15, background: '#FFD400' });
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        const screen = document.getElementById('loading-screen');
        if (screen) { screen.style.opacity = '0'; setTimeout(() => { screen.style.display = 'none'; }, 500); }
        if (isDataLoaded) renderAllMarkers();
    });
    setupEvents();
}

function renderAllMarkers() {
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

// 상세 정보창 (desc 및 삭제 버튼 포함)
function attachInfoWindow(marker, item) {
    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap" style="text-align:center; border-bottom:2px solid #FFD400; padding-bottom:5px; margin-bottom:10px;">
                <span style="font-size:18px; font-weight:900;">${item.name}</span>
            </div>
            <div class="info-grid" style="font-size:12px;">
                <div style="margin-bottom:5px;"><b>유형:</b> ${item.type} | <b>제보자:</b> ${item.user}</div>
                <div style="background:#f9f9f9; padding:8px; border-radius:10px; margin-bottom:10px;">
                    <div style="color:#999; font-size:10px; font-weight:bold;">상세내용</div>
                    <div style="white-space:pre-wrap;">${item.desc || "상세내용이 없습니다."}</div>
                </div>
                <div style="font-size:11px; color:#666;">📍 ${item.address}</div>
            </div>
            <div style="text-align: right; margin-top:10px; border-top:1px solid #eee; padding-top:5px;">
                <span onclick="deleteReport('${item.name}', ${item.lat}, ${item.lng})" style="font-size:11px; color:#ff4d4d; cursor:pointer; text-decoration:underline;">제보 삭제</span>
            </div>
        </div>`;
    const info = new naver.maps.InfoWindow({ content: contentHtml, borderWidth: 0, backgroundColor: "transparent", disableAnchor: true });
    naver.maps.Event.addListener(marker, 'click', () => { if (currentInfo) currentInfo.close(); info.open(map, marker); currentInfo = info; });
}

// 저장 중 모달 제어
function toggleLoading(show) {
    const modal = document.getElementById('saving-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// 제보 등록
async function submitReport() {
    const nick = document.getElementById('nick').value;
    const pw = document.getElementById('p-pw').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;

    if (!nick || !pw || !name) return alert("닉네임, 비번, 장소명은 필수입니다!");
    
    toggleLoading(true);
    const q = new URLSearchParams({ type: "report", user: nick, pw: pw, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
    
    const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
    const result = await res.json();
    toggleLoading(false);

    if (result.res === "ok") { alert("제보가 완료되었습니다!"); location.reload(); }
    else { alert(result.msg); }
}

// 수다글 등록
window.submitPost = async function() {
    const title = document.getElementById('b-title').value;
    const content = document.getElementById('b-content').value;
    const nick = document.getElementById('b-nick').value;
    const pw = document.getElementById('b-pw').value;
    const fileEl = document.getElementById('b-file');

    if (!title || !content || !pw) return alert("제목, 내용, 비밀번호를 입력하세요!");

    toggleLoading(true);
    const sendData = async (imgBase64) => {
        try {
            const response = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ user: nick, pw: pw, title: title, content: content, image_data: imgBase64 })
            });
            const result = await response.json();
            toggleLoading(false);
            if (result.res === "ok") { alert("등록되었습니다!"); refreshBoardData(); }
            else { alert(result.msg); }
        } catch (e) { toggleLoading(false); alert("전송 오류 발생"); }
    };

    if (fileEl.files.length > 0) {
        const reader = new FileReader();
        reader.onload = () => sendData(reader.result);
        reader.readAsDataURL(fileEl.files[0]);
    } else { sendData(""); }
};

// 삭제 로직
async function deleteReport(name, lat, lng) {
    const pw = prompt("제보 시 입력한 비밀번호를 입력하세요.");
    if (!pw) return;
    const q = new URLSearchParams({ type: "delete_report", name: name, lat: lat, lng: lng, pw: pw });
    const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
    const result = await res.json();
    if (result.res === "ok") { alert("삭제되었습니다."); location.reload(); }
    else { alert(result.msg); }
}

async function deletePost(postId) {
    const pw = prompt("글 작성 시 비밀번호를 입력하세요.");
    if (!pw) return;
    const q = new URLSearchParams({ type: "delete_post", post_id: postId, pw: pw });
    const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
    const result = await res.json();
    if (result.res === "ok") { alert("삭제되었습니다."); renderBoard(); refreshBoardData(); }
    else { alert(result.msg); }
}

// 게시판 상세 및 기타 함수
function openBoard() { document.getElementById('board-page').classList.remove('hidden'); renderBoard(); }
function closeBoard() { document.getElementById('board-page').classList.add('hidden'); }
function renderBoard() {
    const content = document.getElementById('board-content');
    content.innerHTML = `<div id="post-list">${boardData.map(p => `<div class="post-card" onclick="viewPostDetail('${p.id}')" style="padding:15px 0; border-bottom:1px solid #eee;">
        <div style="font-size:12px; color:#999;">${p.author}</div><h3 style="margin:5px 0;">${p.title}</h3></div>`).join('')}</div>`;
}
function viewPostDetail(postId) {
    const post = boardData.find(p => String(p.id) === String(postId));
    document.getElementById('board-content').innerHTML = `
        <div class="post-detail">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <button onclick="renderBoard()" class="back-btn">← 목록</button>
                <button onclick="deletePost('${post.id}')" style="color:#ff4d4d; border:none; background:none; text-decoration:underline; font-size:12px;">삭제하기</button>
            </div>
            <h2>${post.title}</h2><p style="font-size:12px; color:#999;">${post.author} | ${new Date(post.date).toLocaleString()}</p>
            ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:10px; margin:15px 0;">` : ""}
            <p style="white-space:pre-wrap; line-height:1.6;">${post.content}</p>
        </div>`;
}
async function refreshBoardData() {
    const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
    boardData = await res.json();
    renderBoard();
}
function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({ position: e.coord, map: map });
        naver.maps.Service.reverseGeocode({ coords: e.coord, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',') }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) addrStr = res.v2.address.roadAddress || res.v2.address.jibunAddress;
        });
    });
}
function moveToMyLoc() { navigator.geolocation.getCurrentPosition((pos) => { map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude)); }); }
function openModal() { if (!pickMarker) return alert("위치 선택!"); document.getElementById('addr-text').innerText = "📍 " + addrStr; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
window.onload = () => { preFetchData(); initMap(); };