/**
 * 거지주차.com 최종 스크립트
 * [수정 사항] 네이버 서비스 로드 대기 및 구문 실행 안정화
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwAlKJkHgmPXpKid3mqczFBCHjmD7B1sdd9YnQp-oUBGbLJYdc0CnGi9ZmBaOTIPsm3/exec";

// [1] 데이터 수급 (최우선 실행)
function preFetchData() {
    console.log("0초: 데이터 수급 즉시 개시");
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
        console.log("데이터 준비 완료, 총 개수:", preloadedData.length);
        if (map) renderAllMarkers();
    })
    .catch(e => console.log("데이터 통신 중 지연 발생"));
}

// [2] 지도 엔진 점화
function initMap() {
    // 네이버 맵 객체가 존재하는지 최종 확인 후 실행
    if (typeof naver === 'undefined') {
        console.log("네이버 지도 API 로드 대기 중...");
        setTimeout(initMap, 100);
        return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        setupMap(37.5665, 126.9780); 
    }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    const mapOptions = {
        center: new naver.maps.LatLng(lat, lng),
        zoom: 15,
        background: '#FFD400'
    };

    map = new naver.maps.Map('map', mapOptions);

    // 지도가 완전히 그려지면 로딩 화면 제거 및 마커 투하
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
        const nickEl = document.getElementById('nick');
        if (nickEl) nickEl.value = oldNick;
    }

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
                icon: { 
                    content: `<div class="label-saved">${item.type || '무료'}</div>`, 
                    anchor: new naver.maps.Point(30, 15) 
                }
            });
            
            attachInfoWindow(marker, item);
            item.isRendered = true;
        }
    });
}

// [4] 상세 정보창 디자인 및 이벤트
function attachInfoWindow(marker, item) {
    const idSafe = item.name.replace(/\s/g, ''); 
    const contentHtml = `
        <div class="custom-info-window">
            <div class="info-title">${item.name}</div>
            <div style="text-align:center; margin-bottom:10px;">
                <span style="font-size:14px; font-weight:bold;">평균 ⭐ ${item.avgRating || '0.0'}</span>
                <span style="font-size:11px; color:#999;">(${item.commentCount || 0}개 후기)</span>
            </div>
            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                <div class="info-full"><span class="info-label">위치</span><span class="info-value">${item.address}</span></div>
            </div>
            
            <div class="feedback-section">
                <div class="star-rating" id="star-wrap-${idSafe}">
                    ${[1,2,3,4,5].map(n => `<span class="star-btn" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <div class="comment-input-box">
                    <input type="text" id="cmt-msg-${idSafe}" class="comment-txt" placeholder="후기를 남겨주세요">
                    <button class="comment-submit" onclick="sendFeedback('${item.name}')">등록</button>
                </div>
            </div>
        </div>
    `;

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

// [5] 별점 UI 제어
function setRatingUI(id, score) {
    const stars = document.querySelectorAll(`#star-wrap-${id} .star-btn`);
    const input = document.getElementById(`rate-val-${id}`);
    if(input) input.value = score;
    stars.forEach((s, i) => s.classList.toggle('active', i < score));
}

// [6] 피드백 서버 전송
async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const user = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;
    if (!msg) return alert("내용을 입력해주세요!");

    const q = new URLSearchParams({ type: "add_comment", target_id: targetName, user: user, comment: msg, rating: rate });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("소중한 별점이 반영되었습니다!");
    location.reload();
}

// [7] 클릭 이벤트 및 주소 추출
function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({
            position: e.coord, map: map,
            icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(12, 24) }
        });

        // 네이버 서비스 모달 로드 확인 후 실행
        if (naver.maps.Service) {
            naver.maps.Service.reverseGeocode({
                coords: e.coord,
                orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',')
            }, (status, res) => {
                if (status === naver.maps.Service.Status.OK) {
                    const addr = res.v2.address;
                    addrStr = addr.roadAddress || addr.jibunAddress;
                }
            });
        }
    });
}

// [8] 제보 제출
async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !name) return alert("닉네임과 장소명을 적어주세요!");
    localStorage.setItem('gj-nick', nick);
    
    const q = new URLSearchParams({ 
        type: "report", 
        user: nick, 
        name: name, 
        ptype: type, 
        addr: addrStr || "주소 정보 없음", 
        desc: desc || "상세 내용 없음", 
        lat: pickMarker.getPosition().lat(), 
        lng: pickMarker.getPosition().lng() 
    });
    
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보 완료!"); 
    location.reload();
}

// [9] 기타 보조 기능
function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}

function openModal() {
    if (!pickMarker) return alert("지도에 위치를 먼저 찍어주세요!");
    const addrEl = document.getElementById('addr-text');
    if (addrEl) addrEl.innerText = "📍 " + (addrStr || "주소 확인 중...");
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { 
    document.getElementById('modal').classList.add('hidden'); 
}

// [10] 실행 시작 (안전한 로드 확인 로직 포함)
window.onload = () => {
    preFetchData();
    initMap();
};