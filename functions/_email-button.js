function emailButtonHtml(link, label, color) {
  const bg = color || '#C9714B';
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0">
  <tr>
    <td align="center" bgcolor="${bg}" style="border-radius:8px;mso-padding-alt:12px 24px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" strokecolor="${bg}" fillcolor="${bg}">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:600;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${link}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

module.exports = { emailButtonHtml };
