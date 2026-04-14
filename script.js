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

// [보정] 제보 상세내용(desc) 및 삭제 버튼 추가
function attachInfoWindow(marker, item) {
    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap"><b>${item.name}</b></div>
            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                <div class="info-full" style="background:#f9f9f9; padding:8px; border-radius:10px; margin:10px 0;">
                    <span class="info-label">상세내용</span><br>
                    <span class="info-value" style="white-space:pre-wrap;">${item.desc || "상세내용이 없습니다."}</span>
                </div>
            </div>
            <div style="text-align: right; border-top: 1px solid #eee; padding-top: 5px;">
                <span onclick="deleteReport('${item.name}', ${item.lat}, ${item.lng})" style="font-size:11px; color:#ff4d4d; cursor:pointer; text-decoration:underline;">제보 삭제 요청</span>
            </div>
        </div>`;

    const info = new naver.maps.InfoWindow({ content: contentHtml, borderWidth: 0, backgroundColor: "transparent", disableAnchor: true });
    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        info.open(map, marker);
        currentInfo = info;
    });
}

// 3. 수다방 기능 (showWriteForm 정의 포함)
function openBoard() {
    document.getElementById('board-page').classList.remove('hidden');
    document.getElementById('floating-menu').style.display = 'none';
    renderBoard();
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

// 4. 데이터 저장 및 삭제 (로딩 모달 연동)
function toggleLoading(show) {
    const modal = document.getElementById('saving-modal');
    if (show) modal.classList.remove('hidden'); else modal.classList.add('hidden');
}

async function submitPost() {
    const title = document.getElementById('b-title').value;
    const nick = document.getElementById('b-nick').value;
    const pw = document.getElementById('b-pw').value;
    const content = document.getElementById('b-content').value;
    const fileEl = document.getElementById('b-file');

    if (!title || !nick || !pw || !content) return alert("모든 항목을 입력하세요!");

    toggleLoading(true);
    const send = async (img) => {
        try {
            const res = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ user: nick, pw: pw, title: title, content: content, image_data: img })
            });
            const result = await res.json();
            if (result.res === "ok") {
                alert("등록 성공!");
                localStorage.setItem('gj-nick', nick);
                location.reload();
            } else { alert("실패: " + result.msg); }
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

async function deleteReport(name, lat, lng) {
    const pw = prompt("제보 시 입력한 비밀번호를 입력하세요.");
    if (!pw) return;
    const q = new URLSearchParams({ type: "delete_report", name: name, lat: lat, lng: lng, pw: pw });
    const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
    const result = await res.json();
    if (result.res === "ok") { alert("삭제 성공!"); location.reload(); } else { alert("실패: " + result.msg); }
}

async function deletePost(postId) {
    const pw = prompt("글 작성 시 비밀번호를 입력하세요.");
    if (!pw) return;
    const q = new URLSearchParams({ type: "delete_post", post_id: postId, pw: pw });
    const res = await fetch(`${SCRIPT_URL}?${q.toString()}`);
    const result = await res.json();
    if (result.res === "ok") { alert("글 삭제 성공!"); location.reload(); } else { alert("실패: " + result.msg); }
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