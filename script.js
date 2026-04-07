var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbweXXsmga1BNFOp6UYLXiKq1mlB4ZHJdecYEFHLxvX46sqPnpTSQlvzZKQu69FNAFRi/exec";

// [1] 데이터 수급
function preFetchData() {
    const urls = [
        `${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`, 
        `${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`
    ];
    
    Promise.all(urls.map(url => 
        fetch(url).then(r => r.json()).catch(e => [])
    ))
    .then(results => {
        preloadedData = [];
        results.forEach(d => {
            if (Array.isArray(d)) preloadedData.push(...d);
        });
        isDataLoaded = true;
        console.log("데이터 준비 완료:", preloadedData.length);
        if (map) renderAllMarkers();
    });
}

// [2] 지도 초기화
function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);

    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        setupMap(37.5665, 126.9780); 
    }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(lat, lng),
        zoom: 15,
        background: '#FFD400'
    });

    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => { screen.style.display = 'none'; }, 500);
        }
        if (isDataLoaded) renderAllMarkers();
    });

    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) {
        document.getElementById('nick').value = oldNick;
    }

    setupEvents();
}

// [3] 마커 및 상세창 (중복 제거 통합)
function renderAllMarkers() {
    if (!map) return;
    preloadedData.forEach(item => {
        const lat = Number(item.lat);
        const lng = Number(item.lng);

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && !item.isRendered) {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(lat, lng),
                map: map,
                icon: { 
                    content: `<div class="label-saved">${item.type || '무료'}</div>`, 
                    anchor: new naver.maps.Point(30, 15) 
                }
            });
            
            // 상세창 연결
            const idSafe = (item.name || "noname").replace(/\s/g, '');
            const contentHtml = `
                <div class="custom-info-window">
                    <div class="info-title">${item.name}</div>
                    <div style="text-align:center; margin-bottom:10px;">
                        <span style="font-size:14px; font-weight:bold;">평균 ⭐ ${item.avgRating || '0.0'}</span>
                        <span style="font-size:11px; color:#999;">(${item.commentCount || 0})</span>
                    </div>
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                        <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                        <div class="info-full"><span class="info-label">주소</span><span class="info-value">${item.address}</span></div>
                    </div>
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

            const info = new naver.maps.InfoWindow({
                content: contentHtml,
                borderWidth: 0,
                backgroundColor: "transparent",
                disableAnchor: true,
                pixelOffset: new naver.maps.Point(0, -10)
            });

            naver.maps.Event.addListener(marker, 'click', () => {
                if (currentInfo) currentInfo.close();
                info.open(map, marker);
                currentInfo = info;
                setTimeout(() => setRatingUI(idSafe, 5), 100);
            });
            
            item.isRendered = true;
        }
    });
}

// [4] 별점 및 피드백
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
    alert("반영되었습니다!");
    location.reload();
}

// [5] 이벤트 및 제보
function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({
            position: e.coord, map: map,
            icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(12, 24) }
        });
        naver.maps.Service.reverseGeocode({
            coords: e.coord,
            orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',')
        }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) {
                addrStr = res.v2.address.roadAddress || res.v2.address.jibunAddress;
            }
        });
    });
}

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !name) return alert("필수 항목을 적어주세요!");
    
    const q = new URLSearchParams({ type: "report", user: nick, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보 완료!"); 
    location.reload();
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}

function openModal() {
    if (!pickMarker) return alert("위치를 먼저 찍어주세요!");
    document.getElementById('addr-text').innerText = "📍 " + addrStr;
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    
    // [중요] 서버에서 넘어온 댓글 배열(item.comments)을 확인하여 리스트 생성
    let commentsHtml = "";
    if (item.comments && item.comments.length > 0) {
        commentsHtml = item.comments.map(c => `
            <div class="comment-item">
                <div class="cmt-header">
                    <span class="cmt-user"><b>${c.user}</b></span>
                    <span class="cmt-star" style="color:#f39c12; font-size:11px; margin-left:5px;">⭐${c.rating}</span>
                </div>
                <div class="cmt-text" style="font-size:12px; color:#333; margin-top:3px;">${c.comment}</div>
            </div>
        `).join('');
    } else {
        commentsHtml = "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다. 첫 후기를 남겨보세요!</div>";
    }

    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap" style="display:flex; align-items:center; justify-content:center; gap:10px; border-bottom:2px solid #FFD400; padding-bottom:8px; margin-bottom:10px;">
                <span style="font-size:18px; font-weight:900;">${item.name}</span>
                <span style="color:#f39c12; font-weight:bold; font-size:16px;">⭐ ${item.avgRating || '0.0'}</span>
            </div>
            
            <div class="info-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:10px;">
                <div class="info-item"><span class="info-label" style="font-size:10px; color:#999;">유형</span><span class="info-value" style="font-size:12px; font-weight:bold;">${item.type}</span></div>
                <div class="info-item"><span class="info-label" style="font-size:10px; color:#999;">제보자</span><span class="info-value" style="font-size:12px; font-weight:bold;">${item.user}</span></div>
                <div class="info-full" style="grid-column:span 2; border-top:1px solid #eee; padding-top:5px;"><span class="info-label" style="font-size:10px; color:#999;">위치</span><span class="info-value" style="font-size:11px;">${item.address}</span></div>
            </div>

            <div class="comment-list" style="max-height:100px; overflow-y:auto; border-top:1px solid #FFD400; border-bottom:1px solid #eee; padding:5px 0; margin-bottom:10px;">
                ${commentsHtml}
            </div>

            <div class="feedback-section">
                <div class="star-rating" id="star-wrap-${idSafe}" style="display:flex; justify-content:center; gap:5px; margin-bottom:8px;">
                    ${[1,2,3,4,5].map(n => `<span class="star-btn" style="cursor:pointer; font-size:20px; color:#ddd;" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <div class="comment-input-box" style="display:flex; gap:5px;">
                    <input type="text" id="cmt-msg-${idSafe}" class="comment-txt" style="flex:1; border:1px solid #eee; border-radius:10px; padding:8px; font-size:12px;" placeholder="매너 있는 댓글 부탁드려요">
                    <button class="comment-submit" style="background:#FFD400; border:none; border-radius:10px; padding:0 10px; font-weight:bold; font-size:12px;" onclick="sendFeedback('${item.name}')">등록</button>
                </div>
            </div>
        </div>`;

    const info = new naver.maps.InfoWindow({
        content: contentHtml,
        borderWidth: 0,
        backgroundColor: "transparent",
        disableAnchor: true,
        pixelOffset: new naver.maps.Point(0, -10)
    });

    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        info.open(map, marker);
        currentInfo = info;
        setTimeout(() => setRatingUI(idSafe, 5), 100);
    });
}

window.onload = () => {
    preFetchData();
    initMap();
};