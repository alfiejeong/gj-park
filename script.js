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
            
            // [연결] 별도로 분리된 상세 정보창 함수를 여기서 호출합니다.
            attachInfoWindow(marker, item);
            
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

/**
 * 상세 정보창 생성 및 이벤트 결합 함수
 * @param {naver.maps.Marker} marker - 네이버 지도 마커 객체
 * @param {Object} item - 서버(GAS)에서 수신한 장소 데이터 객체
 */
function attachInfoWindow(marker, item) {
    // 공백이 포함된 장소명을 HTML ID로 사용하기 위해 공백 제거 처리
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    
    // 1. 서버에서 넘어온 댓글 배열(item.comments)을 기반으로 후기 리스트 HTML 생성
    let commentsHtml = "";
    if (item.comments && item.comments.length > 0) {
        commentsHtml = item.comments.map(c => `
            <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
                <div style="font-size:11px; font-weight:bold; color:#555;">
                    ${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span>
                </div>
                <div style="font-size:12px; color:#333; margin-top:2px; line-height:1.4;">${c.comment}</div>
            </div>
        `).join('');
    } else {
        commentsHtml = "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다. 첫 후기를 남겨보세요!</div>";
    }

    // 2. 인포윈도우에 표시될 전체 레이아웃 구성 (디자인 가이드 반영)
    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap" style="display:flex; align-items:center; justify-content:center; gap:8px; border-bottom:2px solid #FFD400; padding-bottom:8px; margin-bottom:10px;">
                <span style="font-size:18px; font-weight:900; color:#000;">${item.name}</span>
                <span style="color:#f39c12; font-weight:bold; font-size:16px;">⭐ ${item.avgRating || '0.0'}</span>
            </div>
            
            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                <div class="info-full" style="border-top:1px solid #eee; padding-top:5px; margin-top:5px;">
                    <span class="info-label">위치</span><span class="info-value" style="word-break:keep-all;">${item.address}</span>
                </div>
            </div>

            <div class="comment-list" style="max-height:100px; overflow-y:auto; border-top:1px solid #FFD400; margin-bottom:10px; margin-top:10px;">
                ${commentsHtml}
            </div>

            <div class="feedback-section">
                <div class="star-rating" id="star-wrap-${idSafe}" style="display:flex; justify-content:center; gap:5px; margin-bottom:8px;">
                    ${[1, 2, 3, 4, 5].map(n => `<span class="star-btn" style="cursor:pointer; font-size:20px; color:#ddd;" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <div class="comment-input-box" style="display:flex; gap:5px;">
                    <input type="text" id="cmt-msg-${idSafe}" class="comment-txt" style="flex:1; border:1px solid #eee; border-radius:10px; padding:8px; font-size:12px; outline:none;" placeholder="매너 있는 댓글 부탁드려요">
                    <button class="comment-submit" style="background:#FFD400; border:none; border-radius:10px; padding:0 10px; font-weight:bold; font-size:12px; cursor:pointer;" onclick="sendFeedback('${item.name}')">등록</button>
                </div>
            </div>
        </div>`;

    // 3. 네이버 지도 인포윈도우 객체 생성 및 속성 정의
    const info = new naver.maps.InfoWindow({
        content: contentHtml,
        borderWidth: 0,
        backgroundColor: "transparent", // 커스텀 CSS 적용을 위해 배경 투명화
        disableAnchor: true,
        pixelOffset: new naver.maps.Point(0, -10)
    });

    // 4. 마커 클릭 이벤트 리스너 등록
    naver.maps.Event.addListener(marker, 'click', () => {
        // 기존에 열려있는 정보창이 있다면 닫기
        if (currentInfo) currentInfo.close();
        
        // 정보창 열기 및 현재 활성 정보창으로 등록
        info.open(map, marker);
        currentInfo = info;
        
        // 정보창이 렌더링된 후 별점 UI 초기값(5점) 강제 활성화
        setTimeout(() => {
            if (typeof setRatingUI === 'function') {
                setRatingUI(idSafe, 5);
            }
        }, 100);
    });
}

window.onload = () => {
    preFetchData();
    initMap();
};