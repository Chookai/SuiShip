import Link from "next/link";
import Image from "next/image";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="SuiShip home">
      <Image src={suishipLogo} alt="" className="h-11 w-11 object-contain" priority />
      <Image src={suishipName} alt="SuiShip" className="mt-1 h-8 w-auto object-contain" priority />
    </Link>
  );
}
