package catalog
import "testing"
func TestDefaultAndPromotionalDisclosure(t *testing.T){
 if e:=Validate(Default());e!=nil{t.Fatal(e)}
 entries:=Default()
 entries[0].URL="javascript:alert(1)"
 if Validate(entries)==nil{t.Fatal("unsafe URL accepted")}
 entries=Default()
 entries[0].Promoted=true
 if Validate(entries)==nil{t.Fatal("undisclosed promotion accepted")}
 entries[0].Disclosure="合作推广"
 if e:=Validate(entries);e!=nil{t.Fatal(e)}
}
