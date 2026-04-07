var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; // 데이터를 미리 담아둘 저장소
var isDataLoaded = false; // 데이터 로드 완료 여부 체크

// [핵심] 지도를 그리기 전, 파일이 로드되자마자 0초 시점에 데이터부터 부릅니다.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwAlKJkHgmPXpKid3mqczFBCHjmD7B1sdd9YnQp-oUBGbLJYdc0CnGi9ZmBaOTIPsm3/exec";

// [수정] 데이터 수급 함수: 더 안전하게 데이터를 받아옵니다.
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
        // 기존 데이터를 유지하며 새로운 데이터를 추가
        results.forEach(d => {
            if (Array.isArray(d)) {
                preloadedData.push(...d);
            }
        });
        isDataLoaded = true;
        console.log("데이터 준비 완료, 총 개수:", preloadedData.length);
        
        // 지도가 이미 준비되어 있다면 바로 마커 렌더링
        if (map) renderAllMarkers();
    });
}

function initMap() {
    // 시청역을 들르지 않기 위해 위치 정보 획득 후 지도를 생성합니다.
    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        setupMap(37.5665, 126.9780); // 거부 시 서울시청
    }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(lat, lng),
        zoom: 15,
        background: '#FFD400'
    });

    // 지도가 완전히 그려지면 로딩 화면 제거
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => { screen.style.display = 'none'; }, 500);
        }
        // 지도가 뜬 시점에 데이터가 이미 와 있다면 즉시 렌더링
        if (isDataLoaded) renderAllMarkers();
    });

    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) {
        const nickEl = document.getElementById('nick');
        if (nickEl) nickEl.value = oldNick;
    }

    setupEvents();
}

// [수정] 마커 렌더링 함수: 데이터 타입과 변수명을 정밀 타격합니다.
function renderAllMarkers() {
    if (!map) return console.log("지도 엔진 미점화로 렌더링 대기");

    preloadedData.forEach(item => {
        // [중요] 데이터가 문자열일 경우를 대비해 숫자로 강제 변환
        const lat = Number(item.lat);
        const lng = Number(item.lng);

        // 좌표가 유효한지 꼼꼼하게 검사
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && !item.isRendered) {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(lat, lng),
                map: map,
                icon: { 
                    content: `<div class="label-saved">${item.type || '무료'}</div>`, 
                    anchor: new naver.maps.Point(30, 15) 
                }
            });
            
            // 상세 정보창 연결 (기존 커스텀 디자인 유지)
            setupMarkerEvent(marker, item);
            
            item.isRendered = true;
        } else {
            if (!item.isRendered) {
                console.log("좌표 부적합 데이터 스킵:", item.name, "| 위도:", item.lat, "경도:", item.lng);
            }
        }
    });
}

function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        
        pickMarker = new naver.maps.Marker({
            position: e.coord, 
            map: map,
            icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(12, 24) }
        });

        // [고정밀 주소 추출 로직]
        naver.maps.Service.reverseGeocode({
            coords: e.coord,
            orders: [
                naver.maps.Service.OrderType.ADDR,
                naver.maps.Service.OrderType.ROAD_ADDR
            ].join(',')
        }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) {
                const items = res.v2.results;
                if (items.length > 0) {
                    // 도로명 주소가 있으면 최우선, 없으면 지번 주소를 상세히 가져옵니다.
                    const addr = res.v2.address;
                    addrStr = addr.roadAddress || addr.jibunAddress;
                    
                    // 만약 상세 번지수가 빠져있다면 배열에서 직접 조합합니다.
                    if (!addrStr || addrStr.split(' ').length < 4) {
                        const r = items[0];
                        addrStr = `${r.region.area1.name} ${r.region.area2.name} ${r.region.area3.name} ${r.region.area4.name} ${r.land ? r.land.number1 + '-' + r.land.number2 : ''}`.trim();
                    }
                }
                console.log("확정된 상세 주소:", addrStr);
            }
        });
    });
}

function openModal() {
    if (!pickMarker) return alert("지도에 위치를 먼저 찍어주세요!");
    const addrEl = document.getElementById('addr-text');
    if (addrEl) addrEl.innerText = "📍 " + (addrStr || "주소 확인 중...");
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;

    if (!nick || !name) return alert("닉네임과 장소명을 적어주세요!");
    
    localStorage.setItem('gj-nick', nick);

    // [수정] 변수명을 GS 파일의 수신 규격과 완벽히 일치시킵니다.
    const params = {
        type: "report", // 제보임을 명시
        user: nick,
        name: name,
        ptype: type,    // p.ptype으로 수신
        addr: addrStr || "주소 정보 없음", 
        desc: desc || "상세 내용 없음",
        lat: pickMarker.getPosition().lat(),
        lng: pickMarker.getPosition().lng()
    };
    
    const q = new URLSearchParams(params);
    
    // [개선] 302 리디렉션 대응을 위해 주소를 직접 호출하는 방식으로 변경 고려
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    
    alert("제보 완료! 시트를 확인해 보세요."); 
    location.reload();
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}

function renderMarker(item, src) {
    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: map,
        icon: { content: `<div class="label-saved">${item.type}</div>`, anchor: new naver.maps.Point(30, 15) }
    });

    const idSafe = item.name.replace(/\s/g, ''); // ID용 이름 정제
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

// 별점 클릭 시 시각 효과
function setRatingUI(id, score) {
    const stars = document.querySelectorAll(`#star-wrap-${id} .star-btn`);
    document.getElementById(`rate-val-${id}`).value = score;
    stars.forEach((s, i) => s.classList.toggle('active', i < score));
}

// 별점 및 댓글 서버 전송
async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const user = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;

    if (!msg) return alert("내용을 입력해주세요!");

    const q = new URLSearchParams({
        type: "add_comment",
        target_id: targetName,
        user: user,
        comment: msg,
        rating: rate
    });

    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("소중한 별점이 반영되었습니다!");
    location.reload();
}

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
        setTimeout(() => setRatingUI(idSafe, 5), 100); // 열릴 때 5점 기본 세팅
    });
}

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
        // 열리자마자 5점 기본 활성화
        setTimeout(() => setRating(item.name.replace(/\s/g, ''), 5), 100);
    });
}

// 댓글 저장 함수
async function addComment(targetId) {
    const user = localStorage.getItem('gj-nick') || "익명";
    const comment = document.getElementById(`cmt-${targetId}`).value;
    const rating = document.getElementById(`rate-${targetId}`).value;

    if (!comment) return alert("내용을 입력해주세요!");

    const q = new URLSearchParams({
        type: "add_comment",
        target_id: targetId,
        user: user,
        comment: comment,
        rating: rating
    });

    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("소중한 별점이 반영되었습니다!");
    location.reload(); // 평균점수 갱신을 위해 새로고침
}

// 별점 시각화 함수
function setRating(targetId, score) {
    const stars = document.querySelectorAll(`#star-wrap-${targetId} .star-input`);
    document.getElementById(`rate-val-${targetId}`).value = score;
    stars.forEach((s, idx) => {
        s.classList.toggle('active', idx < score);
    });
}

// 댓글 서버 전송 함수
async function submitComment(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const user = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`comment-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;

    if (!msg) return alert("내용을 입력해 주세요!");

    const q = new URLSearchParams({
        type: "add_comment",
        target_id: targetName, // 장소명을 식별자로 사용
        user: user,
        comment: msg,
        rating: rate
    });

    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("소중한 후기가 저장되었습니다!");
    location.reload(); // 평균 별점 갱신을 위해 새로고침
}

// 이벤트 리스너 분리 (코드 가독성)
function setupMarkerEvent(marker, item) {
    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        
        // 정 대표님이 확정한 상세 정보창 UI
        const contentHtml = `
            <div class="custom-info-window">
                <div class="info-title">${item.name}</div>
                <div class="rating-display">⭐ ${item.avgRating || '0.0'}</div>
                <div class="info-grid">
                    <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                    <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                    <div class="info-full"><span class="info-label">상세위치</span><span class="info-value">${item.address}</span></div>
                </div>
                </div>
        `;

        const info = new naver.maps.InfoWindow({
            content: contentHtml,
            borderWidth: 0,
            backgroundColor: "transparent",
            disableAnchor: true
        });
        
        info.open(map, marker);
        currentInfo = info;
    });
}

window.onload = () => {
    preFetchData(); // 데이터를 가져오기 시작하라! (추가된 부분)
    initMap();      // 지도를 그려라!
};