function emailButtonHtml(link, label, color) {
  const bg = color || '#C9714B';
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto;">
  <tr>
    <td align="center" style="border-radius:8px;">
      <!--[if mso]>
     <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:320px;" arcsize="16%" strokecolor="${bg}" fillcolor="${bg}">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;white-space:nowrap;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${link}" target="_blank" style="display:inline-block;min-width:200px;padding:14px 32px;font-family:sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background:${bg};text-align:center;">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

module.exports = { emailButtonHtml };
