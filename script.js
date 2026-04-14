/**
 * 거지주차.com 통합 스크립트
 * [수정내역] 중복 선언 방지, 이미지 경로 자동 보정, 댓글 후 상세페이지 유지
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 
var boardData = [];

// [주의] 이 변수가 파일 내에 딱 하나만 있는지 반드시 확인하십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwdxLOLqQrggzBc2KF_5YgrXpD5ZcGsqvV_RdCovo2nndhR0SE9GXBCkyakvDBz4ugh/exec";

// [보정] 수다방 데이터까지 포함한 통합 수급 로직
// [수정] CORS 에러를 최소화하는 데이터 수급 로직
// [수정] 모든 데이터를 동시에 병렬로 가져오도록 개선 (로딩 속도 최적화)
async function preFetchData() {
    console.log("🚀 데이터 병렬 동기화 시작...");
    
    // 각각의 요청을 프로미스로 생성
    const fetchSheet = fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`).then(res => res.json());
    const fetchSeoul = fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`).then(res => res.json());
    const fetchBoard = fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`).then(res => res.json());

    try {
        // 모든 요청을 동시에 실행하고 결과를 기다림 (가장 빠른 데이터부터 처리 가능)
        const results = await Promise.allSettled([fetchSheet, fetchSeoul, fetchBoard]);

        // 1 & 2: 지도 데이터 처리
        if (results[0].status === 'fulfilled') preloadedData.push(...results[0].value);
        if (results[1].status === 'fulfilled') preloadedData.push(...results[1].value);
        
        // 3: 수다방 데이터 처리
        if (results[2].status === 'fulfilled') {
            boardData = results[2].value;
            // 만약 이미 수다방 화면을 보고 있다면 즉시 렌더링
            if (!document.getElementById('board-page').classList.contains('hidden')) {
                renderBoard();
            }
        }

        isDataLoaded = true;
        console.log("🏁 최종 수급 완료. 수다방 데이터 우선 확보됨");
        if (map) renderAllMarkers();
        
    } catch (e) {
        console.error("통합 수급 프로세스 치명적 에러:", e);
    }
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
                icon: { content: `<div class="label-saved">${item.type || '무료'}</div>`, anchor: new naver.maps.Point(30, 15) }
            });
            attachInfoWindow(marker, item);
            item.isRendered = true;
        }
    });
}

// [4] 상세 정보창 (장소 후기용)
function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    let commentsHtml = item.comments && item.comments.length > 0 ? item.comments.map(c => `
        <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
            <div style="font-size:11px; font-weight:bold; color:#555;">${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
            <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
        </div>`).join('') : "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";

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

// [5] 부가 기능들
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

// [수정] 서버 호출 없이 메모리에 저장된 데이터를 즉시 보여줌
function openBoard() {
    const boardPage = document.getElementById('board-page');
    const menu = document.getElementById('floating-menu');
    
    if (boardPage) {
        boardPage.classList.remove('hidden');
        if (menu) menu.style.display = 'none';
        
        // 이미 preFetchData에서 가져온 boardData를 바로 뿌려줍니다.
        renderBoard(); 
        console.log("⚡ 서버 대기 없이 즉시 렌더링 완료");
    }
}

function closeBoard() {
    const boardPage = document.getElementById('board-page');
    const menu = document.getElementById('floating-menu');
    if (boardPage) {
        boardPage.classList.add('hidden');
        if (menu) menu.style.display = 'flex';
    }
}

async function fetchBoard() {
    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
        boardData = await res.json();
        renderBoard();
    } catch (e) { console.error("데이터 로드 실패"); }
}

function renderBoard() {
    const content = document.getElementById('board-content');
    const writeBtn = document.getElementById('write-btn');
    if(writeBtn) writeBtn.style.display = 'block';

    // 데이터가 아직 없을 경우 로딩 표시
    if (boardData.length === 0 && !isDataLoaded) {
        content.innerHTML = `
            <div style="text-align:center; padding:50px 0;">
                <div class="loader" style="margin:0 auto 20px;"></div>
                <p style="font-weight:bold; color:#666;">수다글을 가져오고 있습니다...</p>
            </div>`;
        return;
    }

    // 데이터가 진짜로 없을 경우
    if (boardData.length === 0 && isDataLoaded) {
        content.innerHTML = `<div style="text-align:center; padding:50px 0; color:#999;">첫 글의 주인공이 되어보세요!</div>`;
        return;
    }

    content.innerHTML = `
        <div id="post-list">
            ${boardData.map(p => `
                <div class="post-card" onclick="viewPostDetail('${p.id}')" style="cursor:pointer; border-bottom:1px solid #eee; padding:20px 0;">
                    <div style="font-size:12px; color:#999; margin-bottom:5px;">${p.author}</div>
                    <h3 style="margin:0 0 8px 0; font-size:18px;">${p.title}</h3>
                    <div style="color:#FFD400; font-size:12px; font-weight:bold;">💬 댓글 ${p.comments ? p.comments.length : 0}</div>
                </div>
            `).join('')}
        </div>`;
}

// [보정] 글 등록이나 댓글 작성 후 실행할 데이터 갱신 함수
async function refreshBoardData(postId = null) {
    const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
    boardData = await res.json();
    
    if (postId) {
        viewPostDetail(postId); // 댓글 작성 시 해당 글 유지
    } else {
        renderBoard(); // 새 글 등록 시 목록으로 이동
    }
}

// [수정] 수다방 글쓰기 폼 - [object] 에러 해결 버전
function showWriteForm() {
    const boardContent = document.getElementById('board-content');
    const currentNick = localStorage.getItem('gj-nick') || "익명"; // nick 대신 명확한 변수명 사용
    
    boardContent.innerHTML = `
        <div class="write-form" style="animation: fadeIn 0.3s;">
            <button onclick="renderBoard()" class="back-btn" style="margin-bottom:15px;">← 목록으로 돌아가기</button>
            <h4 style="margin-bottom:15px;">새로운 수다 남기기 ✍️</h4>
            <input type="text" id="b-title" placeholder="제목" style="width:100%; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box;">
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" id="b-nick" value="${currentNick}" placeholder="닉네임" style="flex:1; padding:12px; border-radius:10px; border:1px solid #ddd;">
                <input type="password" id="b-pw" placeholder="비번" style="flex:1; padding:12px; border-radius:10px; border:1px solid #ddd;">
            </div>
            <textarea id="b-content" placeholder="내용" style="width:100%; height:150px; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box; resize:none;"></textarea>
            <input type="text" id="b-link" placeholder="링크 (선택)" style="width:100%; padding:10px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box;">
            <div style="margin-bottom:15px;">
                <label style="font-size:12px; font-weight:bold; color:#666;">📸 사진 첨부</label>
                <input type="file" id="b-file" accept="image/*" style="width:100%; margin-top:5px;">
            </div>
            <button onclick="submitPost()" class="btn-save" style="width:100%; background:#FFD400; font-size:18px; padding:15px;">등록하기</button>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
}

// [중요] 게시글 상세 보기 함수 보정
function viewPostDetail(postId) {
    const post = boardData.find(p => String(p.id) === String(postId));
    if (!post) return;

    const boardContent = document.getElementById('board-content');
    
    // 서버(GS)에서 이미 uc?id= 형태의 완성된 주소를 주므로, 
    // 정규표현식으로 다시 가공하지 않고 그대로 사용하거나 안전하게 필터링만 합니다.
    let imgUrl = post.imageUrl || "";

    boardContent.innerHTML = `
        <div class="post-detail" style="animation: fadeIn 0.3s;">
            <button onclick="renderBoard()" class="back-btn" style="margin-bottom:15px;">← 목록으로</button>
            <h2 style="margin:0 0 10px 0; font-size:22px;">${post.title}</h2>
            <div style="font-size:12px; color:#999; margin-bottom:20px;">
                작성자: ${post.author} | ${new Date(post.date).toLocaleString()}
            </div>
            
            ${imgUrl ? `<img src="${imgUrl}" style="width:100%; border-radius:15px; margin-bottom:20px; border:1px solid #eee;" onerror="console.log('이미지 로드 실패'); this.style.display='none';">` : ""}
            
            <p style="font-size:15px; line-height:1.7; white-space:pre-wrap; margin-bottom:30px;">${post.content}</p>
            
            ${post.link ? `<a href="${post.link}" target="_blank" style="display:block; padding:12px; background:#f0f7ff; color:#007bff; text-decoration:none; border-radius:10px; margin-bottom:20px; font-size:13px; font-weight:bold;">🔗 링크 바로가기</a>` : ""}
            
            <div class="detail-comments" style="border-top:2px solid #FFD400; padding-top:20px;">
                <h5>댓글 (${post.comments ? post.comments.length : 0})</h5>
                <div id="b-comment-list">
                    ${post.comments && post.comments.length > 0 ? post.comments.map(c => `<div style="background:#f9f9f9; padding:10px; border-radius:10px; margin-bottom:8px; font-size:13px;"><b>${c.user}</b>: ${c.text}</div>`).join('') : "<p style='color:#999; font-size:12px;'>첫 댓글을 남겨보세요!</p>"}
                </div>
                <div style="display:flex; gap:8px; margin-top:20px;">
                    <input type="text" id="cmt-in-${post.id}" placeholder="댓글 입력" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:10px;">
                    <button onclick="submitBoardComment('${post.id}')" style="background:#FFD400; border:none; border-radius:10px; padding:0 15px; font-weight:bold; cursor:pointer;">등록</button>
                </div>
            </div>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
    window.scrollTo(0, 0);
}

/**
 * [최종본] 게시글 및 사진 데이터 서버 송고 함수
 * 보정내역: 전역 스코프 확보, 사진 데이터 직렬화, 전송 후 수다방 유지 로직 통합
 */
window.submitPost = async function() {
    console.log("🚀 [전송 시작] 데이터 송고 절차를 개시합니다.");

    // HTML 요소 확보
    const titleEl = document.getElementById('b-title');
    const contentEl = document.getElementById('b-content');
    const linkEl = document.getElementById('b-link');
    const fileEl = document.getElementById('b-file');
    const nick = localStorage.getItem('gj-nick') || "익명";

    // 1단계: 필수 요소 및 값 체크
    if (!titleEl || !contentEl || !fileEl) {
        console.error("❌ [오류] 화면 요소를 찾을 수 없습니다. HTML ID(b-title, b-content 등)를 확인하십시오.");
        return;
    }

    const title = titleEl.value;
    const content = contentEl.value;
    const link = linkEl.value;

    if (!title || !content) {
        alert("제목과 내용을 모두 입력해야 합니다.");
        return;
    }

    // 버튼 잠금 (중복 클릭 방지 및 상태 표시)
    const saveBtn = document.querySelector('.btn-save');
    if (saveBtn) {
        saveBtn.innerText = "데이터 전송 중...";
        saveBtn.disabled = true;
    }

    // 2단계: 서버 전송 내부 로직 (fetch 포함)
    const sendData = async (imgBase64) => {
        console.log("🚀 [데이터 검수] 사진 변환 용량:", imgBase64.length, "자");
        
        try {
            const response = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                // [보정] Content-Type을 명시하여 데이터 파손 방지
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                redirect: 'follow',
                body: JSON.stringify({
                    user: nick,
                    pw: document.getElementById('b-pw').value, // [추가]
                    title: title,
                    content: content,
                    link: link,
                    image_data: imgBase64 
                })
            });

            const result = await response.json();
            console.log("✅ [서버 응답 결과]", result);

            if (result.res === "ok") {
                alert("성공적으로 등록되었습니다!");
                // 지도로 튕기지 않고 수다방 목록을 즉시 새로고침하여 보여줍니다.
                const refreshRes = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
                boardData = await refreshRes.json();
                renderBoard(); 
            } else {
                alert("서버 기록 오류: " + result.msg);
            }
        } catch (error) {
            console.error("❌ [통신 실패]", error);
            // 구글의 보안 정책(CORS) 특성상 에러가 나더라도 실제 데이터는 기록되었을 수 있으므로 1.5초 후 강제 갱신합니다.
            setTimeout(() => {
                alert("응답 확인 중 지연이 발생했습니다. 목록을 확인하십시오.");
                fetchBoard();
            }, 1500);
        } finally {
            // 버튼 복구
            if (saveBtn) {
                saveBtn.innerText = "등록하기";
                saveBtn.disabled = false;
            }
        }
    };

    // 3단계: 사진 존재 여부에 따른 분기 처리
    if (fileEl.files.length > 0) {
        console.log("🚀 [사진 처리] 파일을 디지털 데이터(Base64)로 변환합니다.");
        const reader = new FileReader();
        reader.onload = () => sendData(reader.result);
        reader.onerror = (e) => {
            console.error("❌ [파일 읽기 에러]", e);
            alert("사진 파일을 읽는 데 실패했습니다.");
        };
        reader.readAsDataURL(fileEl.files[0]);
    } else {
        console.log("🚀 [텍스트 처리] 사진 없이 전송을 시작합니다.");
        sendData("");
    }
};

async function submitBoardComment(postId) {
    const nick = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-in-${postId}`).value;
    if (!msg) return alert("내용 입력!");
    const q = new URLSearchParams({ type: "add_board_comment", post_id: postId, user: nick, comment: msg });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("댓글 등록!");
    // 데이터 갱신 후 상세 페이지 재출력
    const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
    boardData = await res.json();
    viewPostDetail(postId);
}

// [수정] 제보하기 전송 함수 - 비번 누락 해결
async function submitReport() {
    const nick = document.getElementById('nick').value;
    const pw = document.getElementById('p-pw').value; // 이 줄이 빠져있었습니다!
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    
    if (!nick || !pw || !name) return alert("닉네임, 비번, 장소명은 필수입니다!");
    
    const q = new URLSearchParams({ 
        type: "report", 
        user: nick, 
        pw: pw, 
        name: name, 
        ptype: type, 
        addr: addrStr, 
        desc: desc, 
        lat: pickMarker.getPosition().lat(), 
        lng: pickMarker.getPosition().lng() 
    });
    
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보 완료!"); 
    location.reload();
}

function moveToMyLoc() { navigator.geolocation.getCurrentPosition((pos) => { if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude)); }); }
function openModal() { if (!pickMarker) return alert("위치 선택!"); document.getElementById('addr-text').innerText = "📍 " + addrStr; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

window.onload = () => { preFetchData(); initMap(); };