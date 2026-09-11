import {CLIENT_JS as V3} from './client-v3.js';

export const CLIENT_JS=V3
  .replace("$('pNaver').value=d.profile?.naver_blog_url||'';", "$('pYoutube').value=d.profile?.youtube_channel_url||'';$('pNaver').value=d.profile?.naver_blog_url||'';")
  .replace("naver_blog_url:val('pNaver'),instagram_handle:val('pInstagram'),daangn_profile:val('pDaangn')", "youtube_channel_url:val('pYoutube'),naver_blog_url:val('pNaver'),instagram_handle:val('pInstagram'),daangn_profile:val('pDaangn')")
  .replace("const channels=[];if($('chNaver').checked)channels.push('NAVER_BLOG');if($('chInstagram').checked)channels.push('INSTAGRAM');if($('chDaangn').checked)channels.push('DAANGN');", "const channels=[];if($('chYoutube')?.checked)channels.push('YOUTUBE');if($('chNaver').checked)channels.push('NAVER_BLOG');if($('chInstagram').checked)channels.push('INSTAGRAM');if($('chDaangn').checked)channels.push('DAANGN');")
  .replace("await post('/api/promo/assets/generate',{mission_id:currentMission,purpose:n.purpose,channel:n.channel,width:n.width,height:n.height,prompt_hint:n.prompt_hint});toast('홍보 이미지가 만들어졌습니다.');", "const d=await post('/api/promo/assets/generate',{mission_id:currentMission,purpose:n.purpose,channel:n.channel,width:n.width,height:n.height,prompt_hint:n.prompt_hint});toast(d.reused?'기존 학원 홍보자산을 재사용했습니다.':'새 홍보 이미지가 만들어졌습니다.');")
  .replace("window.__AI_OFFICE_READY__=true;", "window.__AI_OFFICE_PROMO_V6__=true;window.__AI_OFFICE_READY__=true;");
