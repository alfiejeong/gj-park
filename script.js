var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 
var boardData = [];

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz29wJzt5MqkTL7bRIgcPQA0OsFI3xbDZ24RFN2VgtVHMrqnn7BZX6Lr9qeso57bfmz/exec";

// [1] 데이터 수급
function preFetchData() {
    console.log("데이터 수급 시작...");
    const urls = [
        `${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`, 
        `${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`
    ];
    
    Promise.all(urls.map(url => fetch(url).then(r => r.json()).catch(e => [])))
    .then(results => {
        preloadedData = [];
        results.forEach(d => { if (Array.isArray(d)) preloadedData.push(...d); });
        isDataLoaded = true;
        console.log("데이터 수급 완료:", preloadedData.length);
        if (map) renderAllMarkers();
    });
}

// [2] 지도 설정
function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);
    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        setupMap(37.5665, 126.9780); 
    }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', { center: new naver.maps.LatLng(lat, lng), zoom: 15, background: '#FFD400' });
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => { document.getElementById('loading-screen').style.display = 'none'; }, 500);
        if (isDataLoaded) renderAllMarkers();
    });
    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) document.getElementById('nick').value = oldNick;
    setupEvents();
}

// [3] 마커 렌더링
function renderAllMarkers() {
    if (!map) return;
    preloadedData.forEach(item => {
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && !item.isRendered) {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(lat, lng),
                map: map,
                icon: { content: `<div class="label-saved">${item.type || '무료'}</div>`, anchor: new naver.maps.Point(30, 15) }
            });
            attachInfoWindow(marker, item);
            item.isRendered = true;
        }
    });
}

// [4] 상세 정보창 (디자인 및 후기 리스트)
function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    let commentsHtml = "";
    
    if (item.comments && item.comments.length > 0) {
        commentsHtml = item.comments.map(c => `
            <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
                <div style="font-size:11px; font-weight:bold; color:#555;">${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
                <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
            </div>`).join('');
    } else {
        commentsHtml = "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";
    }

    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap">
                <span style="font-size:18px; font-weight:900;">${item.name}</span>
                <span class="avg-star">⭐ ${item.avgRating || '0.0'}</span>
            </div>
            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                <div class="info-full"><span class="info-label">주소</span><span class="info-value">${item.address}</span></div>
            </div>
            <div class="comment-list" style="max-height:110px; overflow-y:auto; border-top:1px solid #FFD400; margin:10px 0;">${commentsHtml}</div>
            <div class="feedback-section">
                <div class="star-rating" id="star-wrap-${idSafe}">
                    ${[1,2,3,4,5].map(n => `<span class="star-btn" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <div class="comment-input-box">
                    <input type="text" id="cmt-msg-${idSafe}" class="comment-txt" placeholder="후기 입력">
                    <button class="comment-submit" onclick="sendFeedback('${item.name}')">등록</button>
                </div>
            </div>
        </div>`;

    const info = new naver.maps.InfoWindow({ content: contentHtml, borderWidth: 0, backgroundColor: "transparent", disableAnchor: true, pixelOffset: new naver.maps.Point(0, -10) });
    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        info.open(map, marker);
        currentInfo = info;
        setTimeout(() => setRatingUI(idSafe, 5), 100);
    });
}

// [5] 부가 기능
function setRatingUI(id, score) {
    const stars = document.querySelectorAll(`#star-wrap-${id} .star-btn`);
    const input = document.getElementById(`rate-val-${id}`);
    if(input) input.value = score;
    stars.forEach((s, i) => s.classList.toggle('active', i < score));
}

async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const user = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;
    if (!msg) return alert("내용을 입력해주세요!");
    const q = new URLSearchParams({ type: "add_comment", target_id: targetName, user: user, comment: msg, rating: rate });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("반영되었습니다!"); location.reload();
}

function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({ position: e.coord, map: map, icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(12, 24) } });
        naver.maps.Service.reverseGeocode({ coords: e.coord, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',') }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) { addrStr = res.v2.address.roadAddress || res.v2.address.jibunAddress; }
        });
    });
}

// [추가] 이미지 파일을 문자로 변환
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// [추가] 수다방 열기/닫기
function openBoard() {
    fetchBoard();
    document.getElementById('board-modal').classList.remove('hidden');
}
function closeBoard() { document.getElementById('board-modal').classList.add('hidden'); }

// [추가] 게시글 조회
async function fetchBoard() {
    const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
    boardData = await res.json();
    renderBoard();
}

// [추가] 게시글 출력
function renderBoard() {
    const list = document.getElementById('post-list');
    list.innerHTML = boardData.map(p => `
        <div class="post-item">
            <strong>${p.title}</strong> <small>by ${p.author}</small>
            <p>${p.content}</p>
            ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:100%;">` : ""}
            ${p.link ? `<a href="${p.link}" target="_blank">🔗 링크 보기</a>` : ""}
            <div class="b-comments">
                ${p.comments.map(c => `<div class="b-cmt"><b>${c.user}:</b> ${c.text}</div>`).join('')}
            </div>
            <div class="b-cmt-input">
                <input type="text" id="cmt-in-${p.id}" placeholder="댓글 입력">
                <button onclick="submitBoardComment('${p.id}')">등록</button>
            </div>
        </div>
    `).join('');
}

// [추가] 게시글 등록
async function submitPost() {
    const title = document.getElementById('b-title').value;
    const content = document.getElementById('b-content').value;
    const link = document.getElementById('b-link').value;
    const fileEl = document.getElementById('b-file');
    const nick = localStorage.getItem('gj-nick') || "익명";

    let imgBase64 = "";
    if (fileEl.files.length > 0) imgBase64 = await getBase64(fileEl.files[0]);

    const q = new URLSearchParams({
        type: "add_post",
        user: nick,
        title: title,
        content: content,
        link: link
    });

    await fetch(`${SCRIPT_URL}?${q.toString()}`, {
        method: 'POST',
        body: JSON.stringify({ image_data: imgBase64 })
    });
    alert("게시글 등록 완료!");
    fetchBoard();
}

// [추가] 게시판 댓글 등록
async function submitBoardComment(postId) {
    const nick = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-in-${postId}`).value;
    const q = new URLSearchParams({ type: "add_board_comment", post_id: postId, user: nick, comment: msg });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("댓글 완료!");
    fetchBoard();
}

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !name) return alert("필수 항목 입력!");
    const q = new URLSearchParams({ type: "report", user: nick, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보 완료!"); location.reload();
}

function moveToMyLoc() { navigator.geolocation.getCurrentPosition((pos) => { if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude)); }); }
function openModal() { if (!pickMarker) return alert("위치 선택!"); document.getElementById('addr-text').innerText = "📍 " + addrStr; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

window.onload = () => { preFetchData(); initMap(); };