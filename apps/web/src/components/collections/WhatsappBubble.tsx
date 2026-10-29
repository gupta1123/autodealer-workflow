'use client';
import styles from './CollectionsDashboardPage.module.css';

export const maskPhone=(value:string|null|undefined)=>{
  const digits=String(value??'').replace(/\D/g,'');
  return digits.length>=10?`+91 ${digits.slice(-10,-5)} ${digits.slice(-5)}`:'No number yet';
};

/** A reminder exactly as the customer sees it in WhatsApp. */
export function WhatsappBubble({name,phone,text}:{name:string;phone:string|null|undefined;text:string}) {
  const initials=name.split(/\s+/).filter(Boolean).map(word=>word[0]).join('').slice(0,2).toUpperCase();
  return <div className={styles.whatsapp}>
    <div className={styles.whatsappBar}><span className={styles.whatsappAvatar} aria-hidden="true">{initials}</span><div className={styles.whatsappWho}><b>{name}</b><small>{maskPhone(phone)}</small></div></div>
    <div className={styles.whatsappBody}><div className={styles.whatsappDay}>Today</div><div className={styles.whatsappMessage}>{text}</div></div>
  </div>;
}
