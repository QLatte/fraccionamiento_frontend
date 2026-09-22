/** The open entrance is SICA's visual motif. Decorative, with no simulated QR. */
export function CommunityArt({ className = '' }: { className?: string }) {
  return <svg className={`community-art ${className}`} viewBox="0 0 520 340" fill="none" aria-hidden="true" focusable="false">
    <circle cx="399" cy="73" r="38" fill="#E6B85C"/>
    <path d="M20 288H500M73 315H448" stroke="currentColor" strokeOpacity=".2" strokeWidth="2"/>
    <path d="M175 286L245 179H283L364 286" fill="#C9DEE2"/>
    <path d="M254 196L261 280M271 196L296 280" stroke="#F2F6F8" strokeWidth="3" strokeDasharray="9 10"/>
    <path d="M126 173V118L170 88L214 118V173" fill="#A5C6CF"/>
    <path d="M121 119L170 84L219 119" stroke="#F2F6F8" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M158 173V139H182V173" fill="#235364"/>
    <path d="M306 184V145L346 118L386 145V184" fill="#7EACB9"/>
    <path d="M302 144L346 114L390 144" stroke="#F2F6F8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M335 183V154H355V183" fill="#235364"/>
    <rect x="87" y="166" width="106" height="121" rx="4" fill="#F2F6F8"/>
    <rect x="323" y="166" width="106" height="121" rx="4" fill="#F2F6F8"/>
    <rect x="91" y="164" width="342" height="17" rx="4" fill="#A5C6CF"/>
    <path d="M195 286V185L235 208V264L195 286ZM321 286V185L282 208V264L321 286Z" fill="#477E91"/>
    <path d="M206 202V267M217 209V260M310 202V267M299 209V260" stroke="#D9E8EB" strokeWidth="3"/>
    <rect x="114" y="207" width="49" height="31" rx="3" fill="#123C4A"/>
    <path d="M125 222H152" stroke="#E6B85C" strokeWidth="3" strokeLinecap="round"/>
    <path d="M366 206H389M366 216H389M366 226H389M366 236H389" stroke="#A5C6CF" strokeWidth="3"/>
    <path d="M51 285V220M466 285V196" stroke="#A5C6CF" strokeWidth="7" strokeLinecap="round"/>
    <ellipse cx="51" cy="216" rx="25" ry="40" fill="#659693"/>
    <ellipse cx="466" cy="190" rx="29" ry="49" fill="#659693"/>
    <path d="M44 277H66M451 278H480" stroke="#A5C6CF" strokeWidth="3" strokeLinecap="round"/>
  </svg>;
}
