package settings
import("os";"path/filepath";"testing")
func TestR26PreferencesPersistenceAndOldStateDefaults(t *testing.T){
 p:=filepath.Join(t.TempDir(),"state.json")
 s:=Default()
 if !s.Config.MenuText||s.Config.MiniShow||s.Config.MiniFloat{t.Fatalf("defaults %+v",s.Config)}
 s.Config.MenuText=false;s.Config.MiniShow=true;s.Config.MiniFloat=true;s.Config.MiniX=310;s.Config.MiniY=212
 if err:=Save(p,s);err!=nil{t.Fatal(err)}
 got,err:=Load(p);if err!=nil{t.Fatal(err)}
 if got.Config.MenuText||!got.Config.MiniShow||!got.Config.MiniFloat||got.Config.MiniX!=310||got.Config.MiniY!=212{t.Fatalf("roundtrip %+v",got.Config)}
 old:=[]byte("{\"config\":{\"show\":true,\"locked\":true,\"clock_24\":true,\"poll_seconds\":300}}")
 if err:=os.WriteFile(p,old,0600);err!=nil{t.Fatal(err)}
 loaded,err:=Load(p);if err!=nil{t.Fatal(err)}
 if !loaded.Config.MenuText||loaded.Config.MiniShow||loaded.Config.MiniFloat{t.Fatalf("migration %+v",loaded.Config)}
}
